import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, SETTING_LOCK, getSetting, resetDbForTests, setSetting } from '../db/db.ts';
import {
  LockError,
  disableLock,
  enableLock,
  getLockStatus,
  handleVisibilityChange,
  initLock,
  resetLockForTests,
  toBase64Url,
  unlock,
} from './lock.ts';

const RAW_ID = new Uint8Array([1, 2, 3, 250, 251, 252]).buffer;

function authenticatorData(flags: number): ArrayBuffer {
  const data = new Uint8Array(37);
  data[32] = flags;
  return data.buffer;
}

const create = vi.fn<(options: CredentialCreationOptions) => Promise<Credential | null>>();
const get = vi.fn<(options: CredentialRequestOptions) => Promise<Credential | null>>();

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  resetLockForTests();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
  });
  Object.defineProperty(navigator, 'credentials', {
    value: { create, get },
    configurable: true,
  });
  create.mockResolvedValue({ type: 'public-key', id: 'x', rawId: RAW_ID } as unknown as Credential);
  get.mockResolvedValue({
    type: 'public-key',
    id: 'x',
    rawId: RAW_ID,
    response: { authenticatorData: authenticatorData(0x05) },
  } as unknown as Credential);
  setVisibility('visible');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  create.mockReset();
  get.mockReset();
  await resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      resolve();
    };
  });
});

describe('lås', () => {
  it('är av som standard', async () => {
    await initLock();
    expect(getLockStatus()).toBe('off');
    setVisibility('hidden');
    handleVisibilityChange();
    expect(getLockStatus()).toBe('off');
  });

  it('slås på med en plattformsautentiserare och låses i bakgrunden', async () => {
    await initLock();
    await enableLock();
    expect(getLockStatus()).toBe('unlocked');
    expect(await getSetting(SETTING_LOCK)).toMatchObject({ credentialId: toBase64Url(RAW_ID) });
    const options = create.mock.calls[0]?.[0].publicKey;
    expect(options?.authenticatorSelection).toMatchObject({
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    });

    setVisibility('hidden');
    handleVisibilityChange();
    expect(getLockStatus()).toBe('locked');

    setVisibility('visible');
    await unlock();
    expect(getLockStatus()).toBe('unlocked');
    const request = get.mock.calls[0]?.[0].publicKey;
    expect(request?.userVerification).toBe('required');
    expect(request?.allowCredentials?.[0]?.transports).toEqual(['internal']);
  });

  it('startar låst när låset är på', async () => {
    await setSetting(SETTING_LOCK, { credentialId: toBase64Url(RAW_ID), createdAt: 1 });
    await initLock();
    expect(getLockStatus()).toBe('locked');
  });

  it('låser inte medan fingeravtrycksdialogen visas', async () => {
    await setSetting(SETTING_LOCK, { credentialId: toBase64Url(RAW_ID), createdAt: 1 });
    await initLock();
    get.mockImplementation(() => {
      // Systemdialogen döljer sidan en stund.
      setVisibility('hidden');
      handleVisibilityChange();
      setVisibility('visible');
      return Promise.resolve({
        type: 'public-key',
        rawId: RAW_ID,
        response: { authenticatorData: authenticatorData(0x05) },
      } as unknown as Credential);
    });
    await unlock();
    expect(getLockStatus()).toBe('unlocked');
  });

  it('kräver användarverifiering', async () => {
    await setSetting(SETTING_LOCK, { credentialId: toBase64Url(RAW_ID), createdAt: 1 });
    await initLock();
    get.mockResolvedValue({
      type: 'public-key',
      rawId: RAW_ID,
      response: { authenticatorData: authenticatorData(0x01) },
    } as unknown as Credential);
    await expect(unlock()).rejects.toMatchObject({ code: 'failed' });
    expect(getLockStatus()).toBe('locked');
  });

  it('avvisar okänd nyckel och avbruten dialog', async () => {
    await setSetting(SETTING_LOCK, { credentialId: toBase64Url(RAW_ID), createdAt: 1 });
    await initLock();
    get.mockResolvedValueOnce({
      type: 'public-key',
      rawId: new Uint8Array([9]).buffer,
      response: { authenticatorData: authenticatorData(0x05) },
    } as unknown as Credential);
    await expect(unlock()).rejects.toBeInstanceOf(LockError);
    get.mockRejectedValueOnce(new DOMException('nej', 'NotAllowedError'));
    await expect(unlock()).rejects.toMatchObject({ code: 'cancelled' });
    expect(getLockStatus()).toBe('locked');
  });

  it('kan inte slås på utan stöd', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
    });
    await initLock();
    await expect(enableLock()).rejects.toMatchObject({ code: 'unsupported' });
    expect(getLockStatus()).toBe('off');
  });

  it('kan stängas av', async () => {
    await initLock();
    await enableLock();
    await disableLock();
    expect(getLockStatus()).toBe('off');
    expect(await getSetting(SETTING_LOCK)).toBeUndefined();
  });
});
