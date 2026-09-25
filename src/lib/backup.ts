/**
 * Säkerhetskopiering: hela databasen (profil, mätningar, bilder) som en zip-fil,
 * valfritt krypterad med lösenord (PBKDF2-SHA-256 → AES-256-GCM via Web Crypto).
 *
 * Okrypterad zip:
 *   backup.json        format, version, exportedAt, profil, mätningar, bildmetadata
 *   photos/<id>.<ext>  bilderna som de lagras i IndexedDB
 *
 * Krypterad zip:
 *   backup.json        format, version och krypteringsparametrar (salt, iv, iterationer)
 *   backup.enc         den okrypterade zip-filen ovan, krypterad med AES-GCM
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Measurement, PhotoEntry, Profile, Snapshot } from '../db/db.ts';
import { isIsoDate } from './dates.ts';

export const BACKUP_FORMAT = 'viktresan-backup';
export const BACKUP_VERSION = 1;
/** OWASP:s rekommendation (2023) för PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

const MANIFEST = 'backup.json';
const ENCRYPTED = 'backup.enc';
const PHOTO_DIR = 'photos/';
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;

export type BackupErrorCode =
  'not-a-backup' | 'unsupported-version' | 'invalid-data' | 'password-required' | 'wrong-password';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

export interface BackupContents {
  /** ISO-tidsstämpel för när exporten gjordes. */
  exportedAt: string;
  encrypted: boolean;
  snapshot: Snapshot;
}

export interface BackupSummary {
  exportedAt: string;
  encrypted: boolean;
  hasProfile: boolean;
  measurements: number;
  photos: number;
  photoBytes: number;
  /** Första och sista datum bland mätningar och bilder, eller null om inga finns. */
  firstDate: string | null;
  lastDate: string | null;
}

export interface CreateBackupOptions {
  password?: string;
  now?: Date;
  /** Endast för tester – produktionen använder alltid `PBKDF2_ITERATIONS`. */
  iterations?: number;
}

type Bytes = Uint8Array<ArrayBuffer>;

interface PhotoRecord extends Omit<PhotoEntry, 'blob'> {
  file: string;
}

interface PlainManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  profile: Profile | null;
  measurements: Measurement[];
  photos: PhotoRecord[];
}

interface EncryptedManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  encryption: {
    kdf: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
    cipher: 'AES-GCM';
    iv: string;
  };
}

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// ---------------------------------------------------------------------------
// Export

export async function createBackup(
  snapshot: Snapshot,
  { password, now = new Date(), iterations = PBKDF2_ITERATIONS }: CreateBackupOptions = {},
): Promise<Blob> {
  const files: Zippable = {};
  const photos: PhotoRecord[] = [];
  for (const photo of snapshot.photos) {
    const { blob, ...meta } = photo;
    const file = `${PHOTO_DIR}${photo.id}.${EXTENSIONS[photo.mimeType] ?? 'bin'}`;
    photos.push({ ...meta, file });
    // Bilderna är redan komprimerade – spara dem okomprimerade i zip:en.
    files[file] = [new Uint8Array(await blob.arrayBuffer()), { level: 0, mtime: now }];
  }
  const manifest: PlainManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profile: snapshot.profile,
    measurements: snapshot.measurements,
    photos,
  };
  files[MANIFEST] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime: now }];
  const plain = zipSync(files);

  if (password == null) return new Blob([plain], { type: 'application/zip' });

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad() }, key, plain),
  );
  const header: EncryptedManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    encryption: {
      kdf: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: toBase64(salt),
      cipher: 'AES-GCM',
      iv: toBase64(iv),
    },
  };
  const outer = zipSync({
    [MANIFEST]: [strToU8(JSON.stringify(header, null, 2)), { level: 6, mtime: now }],
    [ENCRYPTED]: [ciphertext, { level: 0, mtime: now }],
  });
  return new Blob([outer], { type: 'application/zip' });
}

export function backupFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `viktresan-backup-${y}-${m}-${d}.zip`;
}

// ---------------------------------------------------------------------------
// Import

/**
 * Läser och validerar en säkerhetskopia. Kastar `BackupError` med
 * `password-required` om filen är krypterad och inget lösenord angavs, och
 * `wrong-password` om lösenordet är fel (eller filen manipulerad).
 */
export async function readBackup(file: Blob, password?: string): Promise<BackupContents> {
  const entries = unzip(new Uint8Array(await file.arrayBuffer()));
  const manifest = parseJson(entries[MANIFEST]);
  checkFormat(manifest);

  if (!('encryption' in manifest)) {
    return { ...parsePlain(manifest, entries), encrypted: false };
  }

  const params = parseEncryption(manifest.encryption);
  const ciphertext = entries[ENCRYPTED];
  if (!ciphertext) throw invalid('Den krypterade delen saknas i filen.');
  if (password == null || password === '') {
    throw new BackupError('password-required', 'Säkerhetskopian är krypterad. Ange lösenordet.');
  }
  const key = await deriveKey(password, params.salt, params.iterations);
  let plain: Bytes;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: params.iv, additionalData: aad() },
        key,
        ciphertext,
      ),
    );
  } catch {
    throw new BackupError(
      'wrong-password',
      'Fel lösenord – eller så är filen skadad. Kontrollera lösenordet och försök igen.',
    );
  }
  const inner = unzip(plain);
  const innerManifest = parseJson(inner[MANIFEST]);
  checkFormat(innerManifest);
  if ('encryption' in innerManifest) throw invalid('Ogiltig krypterad säkerhetskopia.');
  return { ...parsePlain(innerManifest, inner), encrypted: true };
}

export function summarizeBackup(contents: BackupContents): BackupSummary {
  const { snapshot } = contents;
  const dates = [
    ...snapshot.measurements.map((m) => m.date),
    ...snapshot.photos.map((p) => p.date),
  ].sort();
  return {
    exportedAt: contents.exportedAt,
    encrypted: contents.encrypted,
    hasProfile: snapshot.profile !== null,
    measurements: snapshot.measurements.length,
    photos: snapshot.photos.length,
    photoBytes: snapshot.photos.reduce((sum, p) => sum + p.blob.size, 0),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

function unzip(bytes: Bytes): Record<string, Bytes | undefined> {
  try {
    // Packa bara upp filer vi känner igen.
    return unzipSync(bytes, {
      filter: (f) => f.name === MANIFEST || f.name === ENCRYPTED || f.name.startsWith(PHOTO_DIR),
    });
  } catch {
    throw new BackupError('not-a-backup', 'Filen är ingen giltig zip-fil.');
  }
}

function parseJson(bytes: Bytes | undefined): Record<string, unknown> {
  if (!bytes)
    throw new BackupError('not-a-backup', 'Filen är ingen säkerhetskopia från Viktresan.');
  try {
    const value: unknown = JSON.parse(strFromU8(bytes));
    if (isRecord(value)) return value;
  } catch {
    // faller igenom
  }
  throw invalid('Säkerhetskopians innehållsförteckning är skadad.');
}

function checkFormat(manifest: Record<string, unknown>): void {
  if (manifest.format !== BACKUP_FORMAT) {
    throw new BackupError('not-a-backup', 'Filen är ingen säkerhetskopia från Viktresan.');
  }
  if (manifest.version !== BACKUP_VERSION) {
    throw new BackupError(
      'unsupported-version',
      'Säkerhetskopian är gjord med en nyare version av Viktresan. Uppdatera appen och försök igen.',
    );
  }
}

function parseEncryption(value: unknown): { salt: Bytes; iv: Bytes; iterations: number } {
  if (
    !isRecord(value) ||
    value.kdf !== 'PBKDF2' ||
    value.hash !== 'SHA-256' ||
    value.cipher !== 'AES-GCM' ||
    !isInt(value.iterations) ||
    value.iterations < MIN_ITERATIONS ||
    value.iterations > MAX_ITERATIONS ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string'
  ) {
    throw invalid('Okända krypteringsinställningar i säkerhetskopian.');
  }
  const salt = fromBase64(value.salt);
  const iv = fromBase64(value.iv);
  if (!salt || salt.length < 16 || !iv || iv.length !== 12) {
    throw invalid('Okända krypteringsinställningar i säkerhetskopian.');
  }
  return { salt, iv, iterations: value.iterations };
}

function parsePlain(
  manifest: Record<string, unknown>,
  entries: Record<string, Bytes | undefined>,
): Omit<BackupContents, 'encrypted'> {
  const { exportedAt, profile, measurements, photos } = manifest;
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    throw invalid('Exportdatum saknas.');
  }
  if (!Array.isArray(measurements) || !Array.isArray(photos)) {
    throw invalid('Mätningar eller bilder saknas.');
  }
  const parsedMeasurements = measurements.map((m, i) => parseMeasurementRecord(m, i));
  const parsedPhotos = photos.map((p, i) => parsePhotoRecord(p, i, entries));
  assertUniqueIds(parsedMeasurements, 'mätning');
  assertUniqueIds(parsedPhotos, 'bild');
  return {
    exportedAt,
    snapshot: {
      profile: profile == null ? null : parseProfileRecord(profile),
      measurements: parsedMeasurements,
      photos: parsedPhotos,
    },
  };
}

// ---------------------------------------------------------------------------
// Validering. Posterna byggs upp på nytt så att okända fält aldrig når databasen.

function parseProfileRecord(value: unknown): Profile {
  if (
    !isRecord(value) ||
    !isDate(value.startDate) ||
    !isPositive(value.startWeightKg) ||
    !isPositive(value.heightCm) ||
    !isPositive(value.goalWeightKg) ||
    !(value.goalDate === undefined || isDate(value.goalDate))
  ) {
    throw invalid('Profilen i säkerhetskopian är ogiltig.');
  }
  const profile: Profile = {
    startDate: value.startDate,
    startWeightKg: value.startWeightKg,
    heightCm: value.heightCm,
    goalWeightKg: value.goalWeightKg,
  };
  if (value.goalDate !== undefined) profile.goalDate = value.goalDate;
  return profile;
}

function parseMeasurementRecord(value: unknown, index: number): Measurement {
  const bad = () => invalid(`Mätning nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !isPositive(value.weightKg) ||
    !isTimestamp(value.createdAt)
  ) {
    throw bad();
  }
  const m: Measurement = {
    id: value.id,
    date: value.date,
    weightKg: value.weightKg,
    createdAt: value.createdAt,
  };
  if (value.waistCm !== undefined) {
    if (!isPositive(value.waistCm)) throw bad();
    m.waistCm = value.waistCm;
  }
  if (value.steps !== undefined) {
    if (!isInt(value.steps) || value.steps < 0) throw bad();
    m.steps = value.steps;
  }
  if (value.note !== undefined) {
    if (typeof value.note !== 'string') throw bad();
    m.note = value.note;
  }
  if (value.updatedAt !== undefined) {
    if (!isTimestamp(value.updatedAt)) throw bad();
    m.updatedAt = value.updatedAt;
  }
  return m;
}

function parsePhotoRecord(
  value: unknown,
  index: number,
  entries: Record<string, Bytes | undefined>,
): PhotoEntry {
  const bad = (why = 'är ogiltig') => invalid(`Bild nr ${index + 1} i säkerhetskopian ${why}.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    typeof value.mimeType !== 'string' ||
    !(value.mimeType in EXTENSIONS) ||
    !isTimestamp(value.createdAt) ||
    typeof value.file !== 'string'
  ) {
    throw bad();
  }
  const bytes = entries[value.file];
  if (!value.file.startsWith(PHOTO_DIR) || !bytes) throw bad('saknar bildfil');
  const photo: PhotoEntry = {
    id: value.id,
    date: value.date,
    blob: new Blob([bytes], { type: value.mimeType }),
    mimeType: value.mimeType,
    createdAt: value.createdAt,
  };
  if (value.weightKg !== undefined) {
    if (!isPositive(value.weightKg)) throw bad();
    photo.weightKg = value.weightKg;
  }
  if (value.width !== undefined) {
    if (!isInt(value.width) || value.width <= 0) throw bad();
    photo.width = value.width;
  }
  if (value.height !== undefined) {
    if (!isInt(value.height) || value.height <= 0) throw bad();
    photo.height = value.height;
  }
  return photo;
}

function assertUniqueIds(entries: readonly { id: string }[], what: string): void {
  const seen = new Set<string>();
  for (const { id } of entries) {
    if (seen.has(id)) throw invalid(`Samma ${what} förekommer flera gånger i säkerhetskopian.`);
    seen.add(id);
  }
}

function invalid(message: string): BackupError {
  return new BackupError('invalid-data', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && isIsoDate(value);
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10_000;
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// Kryptografi

async function deriveKey(password: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Binder chiffertexten till formatet och versionen. */
function aad(): Bytes {
  return new TextEncoder().encode(`${BACKUP_FORMAT}:${String(BACKUP_VERSION)}`);
}

function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(bytes: Bytes): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Bytes | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
