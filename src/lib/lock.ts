/**
 * Valfritt applås med WebAuthn (plattformsautentiserare: fingeravtryck,
 * ansiktsigenkänning eller skärmlås). Appen låses vid start och när den går i
 * bakgrunden.
 *
 * Obs: det finns ingen server, så låset är ett integritetsskydd för gränssnittet
 * – det krypterar inte datan i IndexedDB.
 */
import { useSyncExternalStore } from 'react';
import { SETTING_LOCK, deleteSetting, getSetting, setSetting } from '../db/db.ts';

export type LockStatus = 'loading' | 'off' | 'locked' | 'unlocked';

export interface LockConfig {
  /** Credentialens rawId, base64url. */
  credentialId: string;
  createdAt: number;
}

export type LockErrorCode = 'unsupported' | 'cancelled' | 'failed';

export class LockError extends Error {
  readonly code: LockErrorCode;

  constructor(code: LockErrorCode, message: string) {
    super(message);
    this.name = 'LockError';
    this.code = code;
  }
}

const TIMEOUT_MS = 60_000;
/** Flaggor i authenticatorData (byte 32): UP = användaren närvarande, UV = verifierad. */
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;

let status: LockStatus = 'loading';
let config: LockConfig | null = null;
/** Pågående WebAuthn-dialoger. Systemdialogen kan dölja sidan – lås inte då. */
let pending = 0;
const listeners = new Set<() => void>();

function setStatus(next: LockStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLockStatus(): LockStatus {
  return status;
}

export function useLockStatus(): LockStatus {
  return useSyncExternalStore(subscribe, getLockStatus);
}

/** Läser inställningen. Är låset på startar appen låst. */
export async function initLock(): Promise<void> {
  if (status !== 'loading') return;
  try {
    config = parseConfig(await getSetting(SETTING_LOCK));
  } catch {
    config = null;
  }
  setStatus(config ? 'locked' : 'off');
}

export async function isLockSupported(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined' || !window.isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Skapar en credential på enheten och slår på låset. */
export async function enableLock(): Promise<void> {
  if (!(await isLockSupported())) {
    throw new LockError('unsupported', 'Enheten saknar stöd för upplåsning med fingeravtryck.');
  }
  const credential = await withDialog(() =>
    navigator.credentials.create({
      publicKey: {
        rp: { name: 'Viktresan' },
        user: { id: randomBytes(16), name: 'viktresan', displayName: 'Viktresan' },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        attestation: 'none',
        timeout: TIMEOUT_MS,
      },
    }),
  );
  const rawId = rawIdOf(credential);
  config = { credentialId: toBase64Url(rawId), createdAt: Date.now() };
  await setSetting(SETTING_LOCK, config);
  setStatus('unlocked');
}

export async function disableLock(): Promise<void> {
  await deleteSetting(SETTING_LOCK);
  config = null;
  setStatus('off');
}

/** Ber om fingeravtryck (eller annan användarverifiering) och låser upp. */
export async function unlock(): Promise<void> {
  if (!config) {
    setStatus('off');
    return;
  }
  const expectedId = config.credentialId;
  const credential = await withDialog(() =>
    navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [
          { type: 'public-key', id: fromBase64Url(expectedId), transports: ['internal'] },
        ],
        userVerification: 'required',
        timeout: TIMEOUT_MS,
      },
    }),
  );
  if (toBase64Url(rawIdOf(credential)) !== expectedId) {
    throw new LockError('failed', 'Okänd nyckel. Försök igen.');
  }
  const response = (credential as PublicKeyCredential).response as AuthenticatorAssertionResponse;
  const flags = new Uint8Array(response.authenticatorData)[32] ?? 0;
  if ((flags & FLAG_UP) === 0 || (flags & FLAG_UV) === 0) {
    throw new LockError('failed', 'Enheten kunde inte verifiera dig. Försök igen.');
  }
  setStatus('unlocked');
}

export function lockNow(): void {
  if (config && status === 'unlocked') setStatus('locked');
}

/** Lås när appen går i bakgrunden (byter app, släcker skärmen, byter flik). */
export function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden' && pending === 0) lockNow();
}

/** Endast för tester. */
export function resetLockForTests(): void {
  status = 'loading';
  config = null;
  pending = 0;
  listeners.clear();
}

async function withDialog(run: () => Promise<Credential | null>): Promise<Credential> {
  pending += 1;
  try {
    const credential = await run();
    if (!credential) throw new LockError('failed', 'Ingen nyckel returnerades. Försök igen.');
    return credential;
  } catch (err) {
    if (err instanceof LockError) throw err;
    if (
      err instanceof DOMException &&
      (err.name === 'NotAllowedError' || err.name === 'AbortError')
    ) {
      throw new LockError('cancelled', 'Avbrutet eller inte godkänt. Försök igen.');
    }
    throw new LockError('failed', 'Det gick inte att använda fingeravtryck. Försök igen.');
  } finally {
    pending -= 1;
  }
}

function rawIdOf(credential: Credential): ArrayBuffer {
  if (credential.type !== 'public-key') throw new LockError('failed', 'Oväntad nyckeltyp.');
  return (credential as PublicKeyCredential).rawId;
}

function parseConfig(value: unknown): LockConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const { credentialId, createdAt } = value as Record<string, unknown>;
  if (typeof credentialId !== 'string' || credentialId === '' || typeof createdAt !== 'number') {
    return null;
  }
  return { credentialId, createdAt };
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
