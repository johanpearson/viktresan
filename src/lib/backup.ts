/**
 * Säkerhetskopiering: hela databasen (profil, vikt, midja, steg, bilder, mat, vatten, träning,
 * GLP-1) som en zip-fil,
 * valfritt krypterad med lösenord (PBKDF2-SHA-256 → AES-256-GCM via Web Crypto).
 *
 * Okrypterad zip:
 *   backup.json        format, version, exportedAt, profil, weights, waist, steps, bildmetadata,
 *                      foods, meals, foodLog, favorites (sedan version 3),
 *                      water, workouts, workoutPlans (sedan version 4),
 *                      medications, injections, symptoms (sedan version 5),
 *                      foodUnits + mängd/enhet i matlogg och måltider (sedan version 6;
 *                      äldre portioner räknas om med samma funktioner som databasmigreringen)
 *                      (version 1: `measurements` med vikt, midja och steg i samma post)
 *   photos/<id>.<ext>  bilderna som de lagras i IndexedDB
 *
 * Krypterad zip:
 *   backup.json        format, version och krypteringsparametrar (salt, iv, iterationer)
 *   backup.enc         den okrypterade zip-filen ovan, krypterad med AES-GCM
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  splitLegacyMeasurements,
  upgradeFoodData,
  type CustomUnits,
  type LegacyAmount,
  type LegacyFoodLogEntry,
  type LegacyMealIngredient,
  type LegacySavedMeal,
  type LegacyStoredFood,
  type Favorite,
  type FoodLogEntry,
  type Injection,
  type LegacyMeasurement,
  type Medication,
  type PhotoEntry,
  type SavedMeal,
  type StoredFood,
  type Profile,
  type Snapshot,
  type StepsEntry,
  type SymptomEntry,
  type WaistEntry,
  type WaterEntry,
  type WeightEntry,
  type Workout,
  type WorkoutPlan,
} from '../db/db.ts';
import { isIsoDate } from './dates.ts';
import { ACTIVITY_LEVELS, RATE_OPTIONS } from './energy.ts';
import { APPETITE_MAX, APPETITE_MIN, DOSE_FREQUENCIES, isInjectionSite } from './glp1.ts';
import { MEAL_SLOTS, type Nutrients } from './nutrition.ts';
import type { FoodUnit, UnitSource } from './units.ts';
import { isValidProteinFactor } from './protein.ts';
import { isTime } from './validation.ts';
import { WATER_ENTRY_MAX_ML, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from './water.ts';
import { INTENSITIES, WORKOUT_STATUSES, type Intensity } from './workouts.ts';

export const BACKUP_FORMAT = 'viktresan-backup';
export const BACKUP_VERSION = 6;
/** Versioner som fortfarande går att importera. */
const READABLE_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6];
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
  weights: number;
  waist: number;
  steps: number;
  photos: number;
  photoBytes: number;
  /** Poster i matloggen. */
  foodLog: number;
  /** Egna livsmedel och sparade måltider. */
  foods: number;
  meals: number;
  /** Vattenposter, pass och återkommande scheman. */
  water: number;
  workouts: number;
  workoutPlans: number;
  /** GLP-1: läkemedel, injektioner och dagar med mående. */
  medications: number;
  injections: number;
  symptoms: number;
  /** Första och sista datum bland alla poster, eller null om inga finns. */
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
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  photos: PhotoRecord[];
  foods: StoredFood[];
  meals: SavedMeal[];
  foodLog: FoodLogEntry[];
  favorites: Favorite[];
  water: WaterEntry[];
  workouts: Workout[];
  workoutPlans: WorkoutPlan[];
  medications: Medication[];
  injections: Injection[];
  symptoms: SymptomEntry[];
  foodUnits: CustomUnits[];
}

interface EncryptedManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
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
    weights: snapshot.weights,
    waist: snapshot.waist,
    steps: snapshot.steps,
    photos,
    foods: snapshot.foods,
    meals: snapshot.meals,
    foodLog: snapshot.foodLog,
    favorites: snapshot.favorites,
    water: snapshot.water,
    workouts: snapshot.workouts,
    workoutPlans: snapshot.workoutPlans,
    medications: snapshot.medications,
    injections: snapshot.injections,
    symptoms: snapshot.symptoms,
    foodUnits: snapshot.foodUnits,
  };
  files[MANIFEST] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime: now }];
  const plain = zipSync(files);

  if (password == null) return new Blob([plain], { type: 'application/zip' });

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(BACKUP_VERSION) },
      key,
      plain,
    ),
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
  const version = checkFormat(manifest);

  if (!('encryption' in manifest)) {
    return { ...parsePlain(manifest, version, entries), encrypted: false };
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
        { name: 'AES-GCM', iv: params.iv, additionalData: aad(version) },
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
  if (checkFormat(innerManifest) !== version || 'encryption' in innerManifest) {
    throw invalid('Ogiltig krypterad säkerhetskopia.');
  }
  return { ...parsePlain(innerManifest, version, inner), encrypted: true };
}

export function summarizeBackup(contents: BackupContents): BackupSummary {
  const { snapshot } = contents;
  const dates = [
    ...snapshot.weights,
    ...snapshot.waist,
    ...snapshot.steps,
    ...snapshot.photos,
    ...snapshot.foodLog,
    ...snapshot.water,
    ...snapshot.workouts,
    ...snapshot.injections,
    ...snapshot.symptoms,
  ]
    .map((e) => e.date)
    .sort();
  return {
    exportedAt: contents.exportedAt,
    encrypted: contents.encrypted,
    hasProfile: snapshot.profile !== null,
    weights: snapshot.weights.length,
    waist: snapshot.waist.length,
    steps: snapshot.steps.length,
    photos: snapshot.photos.length,
    photoBytes: snapshot.photos.reduce((sum, p) => sum + p.blob.size, 0),
    foodLog: snapshot.foodLog.length,
    foods: snapshot.foods.length,
    meals: snapshot.meals.length,
    water: snapshot.water.length,
    workouts: snapshot.workouts.length,
    workoutPlans: snapshot.workoutPlans.length,
    medications: snapshot.medications.length,
    injections: snapshot.injections.length,
    symptoms: snapshot.symptoms.length,
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

/** Kontrollerar format och version och returnerar versionen. */
function checkFormat(manifest: Record<string, unknown>): number {
  if (manifest.format !== BACKUP_FORMAT) {
    throw new BackupError('not-a-backup', 'Filen är ingen säkerhetskopia från Viktresan.');
  }
  const { version } = manifest;
  if (typeof version !== 'number' || !READABLE_VERSIONS.includes(version)) {
    throw new BackupError(
      'unsupported-version',
      'Säkerhetskopian är gjord med en nyare version av Viktresan. Uppdatera appen och försök igen.',
    );
  }
  return version;
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
  version: number,
  entries: Record<string, Bytes | undefined>,
): Omit<BackupContents, 'encrypted'> {
  const { exportedAt, profile, photos } = manifest;
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    throw invalid('Exportdatum saknas.');
  }
  if (!Array.isArray(photos)) throw invalid('Bilder saknas.');
  const parsedPhotos = photos.map((p, i) => parsePhotoRecord(p, i, entries));
  assertUniqueKeys(parsedPhotos, (p) => p.id, 'bild');
  return {
    exportedAt,
    snapshot: {
      profile: profile == null ? null : parseProfileRecord(profile),
      ...(version === 1 ? parseV1Measurements(manifest) : parseV2Measurements(manifest)),
      photos: parsedPhotos,
      // Version 1–2 saknar mat.
      ...(version >= 3 ? parseFoodData(manifest, version) : emptyFoodData()),
      // Version 1–3 saknar vatten och träning.
      ...(version >= 4 ? parseTrainingData(manifest) : emptyTrainingData()),
      // Version 1–4 saknar GLP-1.
      ...(version >= 5 ? parseGlp1Data(manifest) : emptyGlp1Data()),
    },
  };
}

type MeasurementLists = Pick<Snapshot, 'weights' | 'waist' | 'steps'>;

/** Version 1: vikt, midja och steg i samma post – delas upp som i databasmigreringen. */
function parseV1Measurements(manifest: Record<string, unknown>): MeasurementLists {
  const { measurements } = manifest;
  if (!Array.isArray(measurements)) throw invalid('Mätningar saknas.');
  const parsed = measurements.map((m, i) => parseLegacyRecord(m, i));
  assertUniqueKeys(parsed, (m) => m.id, 'mätning');
  return splitLegacyMeasurements(parsed);
}

function parseV2Measurements(manifest: Record<string, unknown>): MeasurementLists {
  const { weights, waist, steps } = manifest;
  if (!Array.isArray(weights) || !Array.isArray(waist) || !Array.isArray(steps)) {
    throw invalid('Mätningar saknas.');
  }
  const result: MeasurementLists = {
    weights: weights.map((w, i) => parseWeightRecord(w, i)),
    waist: waist.map((w, i) => parseWaistRecord(w, i)),
    steps: steps.map((s, i) => parseStepsRecord(s, i)),
  };
  assertUniqueKeys(result.weights, (w) => w.id, 'viktmätning');
  assertUniqueKeys(result.waist, (w) => w.date, 'dag med midjemått');
  assertUniqueKeys(result.steps, (s) => s.date, 'dag med steg');
  return result;
}

type FoodData = Pick<Snapshot, 'foods' | 'meals' | 'foodLog' | 'favorites' | 'foodUnits'>;

function emptyFoodData(): FoodData {
  return { foods: [], meals: [], foodLog: [], favorites: [], foodUnits: [] };
}

/**
 * Mat (version 3+). Version 3–5 har portioner i stället för enheter; de räknas om
 * med `upgradeFoodData` precis som i databasmigreringen till v7.
 */
function parseFoodData(manifest: Record<string, unknown>, version: number): FoodData {
  const { foods, meals, foodLog, favorites, foodUnits } = manifest;
  if (
    !Array.isArray(foods) ||
    !Array.isArray(meals) ||
    !Array.isArray(foodLog) ||
    !Array.isArray(favorites) ||
    (version >= 6 && !Array.isArray(foodUnits))
  ) {
    throw invalid('Matdata saknas.');
  }
  const upgraded = upgradeFoodData({
    foods: foods.map((f, i) => parseFoodRecord(f, i)),
    meals: meals.map((m, i) => parseMealRecord(m, i)),
    foodLog: foodLog.map((e, i) => parseFoodLogRecord(e, i)),
  });
  const custom = Array.isArray(foodUnits)
    ? foodUnits.map((u, i) => parseCustomUnitsRecord(u, i))
    : [];
  const result: FoodData = {
    ...upgraded,
    favorites: favorites.map((f, i) => parseFavoriteRecord(f, i)),
    // Egna enheter i filen går före enheter som räknats fram ur gamla portioner.
    foodUnits: [
      ...custom,
      ...upgraded.foodUnits.filter((u) => !custom.some((c) => c.foodId === u.foodId)),
    ],
  };
  assertUniqueKeys(result.foods, (f) => f.id, 'livsmedel');
  assertUniqueKeys(result.meals, (m) => m.id, 'måltid');
  assertUniqueKeys(result.foodLog, (e) => e.id, 'matloggpost');
  assertUniqueKeys(result.favorites, (f) => f.foodId, 'favorit');
  assertUniqueKeys(result.foodUnits, (u) => u.foodId, 'livsmedel med egna enheter');
  return result;
}

type TrainingData = Pick<Snapshot, 'water' | 'workouts' | 'workoutPlans'>;

function emptyTrainingData(): TrainingData {
  return { water: [], workouts: [], workoutPlans: [] };
}

function parseTrainingData(manifest: Record<string, unknown>): TrainingData {
  const { water, workouts, workoutPlans } = manifest;
  if (!Array.isArray(water) || !Array.isArray(workouts) || !Array.isArray(workoutPlans)) {
    throw invalid('Vatten- eller träningsdata saknas.');
  }
  const result: TrainingData = {
    water: water.map((w, i) => parseWaterRecord(w, i)),
    workouts: workouts.map((w, i) => parseWorkoutRecord(w, i)),
    workoutPlans: workoutPlans.map((p, i) => parsePlanRecord(p, i)),
  };
  assertUniqueKeys(result.water, (w) => w.id, 'vattenpost');
  assertUniqueKeys(result.workouts, (w) => w.id, 'pass');
  assertUniqueKeys(result.workoutPlans, (p) => p.id, 'schema');
  return result;
}

type Glp1Data = Pick<Snapshot, 'medications' | 'injections' | 'symptoms'>;

function emptyGlp1Data(): Glp1Data {
  return { medications: [], injections: [], symptoms: [] };
}

function parseGlp1Data(manifest: Record<string, unknown>): Glp1Data {
  const { medications, injections, symptoms } = manifest;
  if (!Array.isArray(medications) || !Array.isArray(injections) || !Array.isArray(symptoms)) {
    throw invalid('GLP-1-data saknas.');
  }
  const result: Glp1Data = {
    medications: medications.map((m, i) => parseMedicationRecord(m, i)),
    injections: injections.map((e, i) => parseInjectionRecord(e, i)),
    symptoms: symptoms.map((s, i) => parseSymptomRecord(s, i)),
  };
  assertUniqueKeys(result.medications, (m) => m.id, 'läkemedel');
  assertUniqueKeys(result.injections, (e) => e.id, 'injektion');
  assertUniqueKeys(result.symptoms, (s) => s.date, 'dag med mående');
  return result;
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
  const bad = () => invalid('Profilen i säkerhetskopian är ogiltig.');
  if (value.sex !== undefined) {
    if (value.sex !== 'man' && value.sex !== 'kvinna') throw bad();
    profile.sex = value.sex;
  }
  if (value.birthYear !== undefined) {
    if (!isInt(value.birthYear) || value.birthYear < 1900 || value.birthYear > 2100) throw bad();
    profile.birthYear = value.birthYear;
  }
  if (value.activityLevel !== undefined) {
    const level = ACTIVITY_LEVELS.find((a) => a.id === value.activityLevel);
    if (!level) throw bad();
    profile.activityLevel = level.id;
  }
  if (value.ratePerWeekKg !== undefined) {
    if (typeof value.ratePerWeekKg !== 'number' || !RATE_OPTIONS.includes(value.ratePerWeekKg))
      throw bad();
    profile.ratePerWeekKg = value.ratePerWeekKg;
  }
  if (value.waterGoalMl !== undefined) {
    if (
      !isInt(value.waterGoalMl) ||
      value.waterGoalMl < WATER_GOAL_MIN_ML ||
      value.waterGoalMl > WATER_GOAL_MAX_ML
    )
      throw bad();
    profile.waterGoalMl = value.waterGoalMl;
  }
  if (value.proteinFactor !== undefined) {
    if (!isValidProteinFactor(value.proteinFactor)) throw bad();
    profile.proteinFactor = value.proteinFactor;
  }
  return profile;
}

function parseWeightRecord(value: unknown, index: number, what = 'Viktmätning'): WeightEntry {
  const bad = () => invalid(`${what} nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !isPositive(value.weightKg) ||
    !isTimestamp(value.createdAt)
  ) {
    throw bad();
  }
  const w: WeightEntry = {
    id: value.id,
    date: value.date,
    weightKg: value.weightKg,
    createdAt: value.createdAt,
  };
  if (value.note !== undefined) {
    if (typeof value.note !== 'string') throw bad();
    w.note = value.note;
  }
  if (value.updatedAt !== undefined) {
    if (!isTimestamp(value.updatedAt)) throw bad();
    w.updatedAt = value.updatedAt;
  }
  return w;
}

function parseLegacyRecord(value: unknown, index: number): LegacyMeasurement {
  const bad = () => invalid(`Mätning nr ${index + 1} i säkerhetskopian är ogiltig.`);
  const m: LegacyMeasurement = parseWeightRecord(value, index, 'Mätning');
  if (!isRecord(value)) throw bad();
  if (value.waistCm !== undefined) {
    if (!isPositive(value.waistCm)) throw bad();
    m.waistCm = value.waistCm;
  }
  if (value.steps !== undefined) {
    if (!isSteps(value.steps)) throw bad();
    m.steps = value.steps;
  }
  return m;
}

/** Gemensamt för poster med datum som nyckel (midja, steg). */
function parseDailyTimes(
  value: Record<string, unknown>,
  bad: () => BackupError,
): { date: string; createdAt: number; updatedAt?: number } {
  if (!isDate(value.date) || !isTimestamp(value.createdAt)) throw bad();
  const times: { date: string; createdAt: number; updatedAt?: number } = {
    date: value.date,
    createdAt: value.createdAt,
  };
  if (value.updatedAt !== undefined) {
    if (!isTimestamp(value.updatedAt)) throw bad();
    times.updatedAt = value.updatedAt;
  }
  return times;
}

function parseWaistRecord(value: unknown, index: number): WaistEntry {
  const bad = () => invalid(`Midjemått nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  if (!isRecord(value) || !isPositive(value.waistCm)) throw bad();
  return { ...parseDailyTimes(value, bad), waistCm: value.waistCm };
}

function parseStepsRecord(value: unknown, index: number): StepsEntry {
  const bad = () => invalid(`Steg nr ${index + 1} i säkerhetskopian är ogiltiga.`);
  if (!isRecord(value) || !isSteps(value.steps)) throw bad();
  return { ...parseDailyTimes(value, bad), steps: value.steps };
}

function parseTimes(
  value: Record<string, unknown>,
  bad: () => BackupError,
): { createdAt: number; updatedAt?: number } {
  if (!isTimestamp(value.createdAt)) throw bad();
  const times: { createdAt: number; updatedAt?: number } = { createdAt: value.createdAt };
  if (value.updatedAt !== undefined) {
    if (!isTimestamp(value.updatedAt)) throw bad();
    times.updatedAt = value.updatedAt;
  }
  return times;
}

function parseNutrients(value: unknown, bad: () => BackupError): Nutrients {
  if (
    !isRecord(value) ||
    !isAmount(value.kcal) ||
    !isAmount(value.proteinG) ||
    !isAmount(value.carbsG) ||
    !isAmount(value.fatG)
  ) {
    throw bad();
  }
  return { kcal: value.kcal, proteinG: value.proteinG, carbsG: value.carbsG, fatG: value.fatG };
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 200;
}

const UNIT_SOURCES: readonly UnitSource[] = ['standard', 'openfoodfacts', 'egen'];

function parseUnit(value: unknown, bad: () => BackupError): FoodUnit {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    value.name.length > 40 ||
    !isPositive(value.grams) ||
    !UNIT_SOURCES.includes(value.source as UnitSource)
  ) {
    throw bad();
  }
  return { name: value.name, grams: value.grams, source: value.source as UnitSource };
}

function parseUnits(value: unknown, bad: () => BackupError): FoodUnit[] {
  if (!Array.isArray(value) || value.length > 50) throw bad();
  return value.map((u) => parseUnit(u, bad));
}

function parseCustomUnitsRecord(value: unknown, index: number): CustomUnits {
  const bad = () => invalid(`Egna enheter nr ${index + 1} i säkerhetskopian är ogiltiga.`);
  if (!isRecord(value) || !isId(value.foodId)) throw bad();
  return { foodId: value.foodId, units: parseUnits(value.units, bad), ...parseTimes(value, bad) };
}

/**
 * Mängd: `amount` + `unit` (version 6) eller gram med valfria portioner (version 3–5).
 * Gram krävs alltid.
 */
function parseAmount(value: Record<string, unknown>, bad: () => BackupError): LegacyAmount {
  if (!isPositive(value.grams)) throw bad();
  const result: LegacyAmount = { grams: value.grams };
  if (value.amount !== undefined || value.unit !== undefined) {
    if (!isPositive(value.amount) || !isName(value.unit) || value.unit.length > 40) throw bad();
    result.amount = value.amount;
    result.unit = value.unit;
  }
  if (value.portionName !== undefined) {
    if (!isName(value.portionName)) throw bad();
    result.portionName = value.portionName;
  }
  if (value.portionCount !== undefined) {
    if (!isPositive(value.portionCount)) throw bad();
    result.portionCount = value.portionCount;
  }
  return result;
}

function parseFoodRecord(value: unknown, index: number): LegacyStoredFood {
  const bad = () => invalid(`Livsmedel nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isName(value.name) ||
    (value.source !== 'egen' && value.source !== 'openfoodfacts')
  ) {
    throw bad();
  }
  const food: LegacyStoredFood = {
    id: value.id,
    name: value.name,
    source: value.source,
    per100: parseNutrients(value.per100, bad),
    ...parseTimes(value, bad),
  };
  if (value.portionG !== undefined) {
    if (!isPositive(value.portionG)) throw bad();
    food.portionG = value.portionG;
  }
  if (value.portionName !== undefined) {
    if (!isName(value.portionName)) throw bad();
    food.portionName = value.portionName;
  }
  if (value.units !== undefined) food.units = parseUnits(value.units, bad);
  if (value.ean !== undefined) {
    if (typeof value.ean !== 'string' || !/^\d{8,14}$/.test(value.ean)) throw bad();
    food.ean = value.ean;
  }
  return food;
}

function parseIngredient(value: unknown, bad: () => BackupError): LegacyMealIngredient {
  if (!isRecord(value) || !isId(value.foodId) || !isName(value.name)) throw bad();
  return {
    foodId: value.foodId,
    name: value.name,
    ...parseAmount(value, bad),
    per100: parseNutrients(value.per100, bad),
  };
}

function parseMealRecord(value: unknown, index: number): LegacySavedMeal {
  const bad = () => invalid(`Måltid nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (!isRecord(value) || !isId(value.id) || !isName(value.name) || !Array.isArray(value.items)) {
    throw bad();
  }
  return {
    id: value.id,
    name: value.name,
    items: value.items.map((item) => parseIngredient(item, bad)),
    ...parseTimes(value, bad),
  };
}

function parseFoodLogRecord(value: unknown, index: number): LegacyFoodLogEntry {
  const bad = () => invalid(`Matloggpost nr ${index + 1} i säkerhetskopian är ogiltig.`);
  const slot = isRecord(value) ? MEAL_SLOTS.find((m) => m.id === value.meal) : undefined;
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !slot ||
    !isId(value.foodId) ||
    !isName(value.name)
  ) {
    throw bad();
  }
  return {
    id: value.id,
    date: value.date,
    meal: slot.id,
    foodId: value.foodId,
    name: value.name,
    ...parseAmount(value, bad),
    per100: parseNutrients(value.per100, bad),
    ...parseTimes(value, bad),
  };
}

function parseFavoriteRecord(value: unknown, index: number): Favorite {
  const bad = () => invalid(`Favorit nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (!isRecord(value) || !isId(value.foodId) || !isTimestamp(value.createdAt)) throw bad();
  return { foodId: value.foodId, createdAt: value.createdAt };
}

function parseWaterRecord(value: unknown, index: number): WaterEntry {
  const bad = () => invalid(`Vattenpost nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !isInt(value.ml) ||
    value.ml < 1 ||
    value.ml > WATER_ENTRY_MAX_ML
  ) {
    throw bad();
  }
  return { id: value.id, date: value.date, ml: value.ml, ...parseTimes(value, bad) };
}

function isDuration(value: unknown): value is number {
  return isInt(value) && value >= 1 && value <= 600;
}

function parseOptionalIntensity(value: unknown, bad: () => BackupError): Intensity | undefined {
  if (value === undefined) return undefined;
  const intensity = INTENSITIES.find((i) => i.id === value);
  if (!intensity) throw bad();
  return intensity.id;
}

function parseOptionalNote(value: unknown, bad: () => BackupError): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500) throw bad();
  return value;
}

function parseWorkoutRecord(value: unknown, index: number): Workout {
  const bad = () => invalid(`Pass nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  const status = isRecord(value) ? WORKOUT_STATUSES.find((s) => s.id === value.status) : undefined;
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !isName(value.type) ||
    !isDuration(value.durationMin) ||
    !status
  ) {
    throw bad();
  }
  const workout: Workout = {
    id: value.id,
    date: value.date,
    type: value.type,
    durationMin: value.durationMin,
    status: status.id,
    ...parseTimes(value, bad),
  };
  if (value.time !== undefined) {
    if (typeof value.time !== 'string' || !isTime(value.time)) throw bad();
    workout.time = value.time;
  }
  const intensity = parseOptionalIntensity(value.intensity, bad);
  if (intensity) workout.intensity = intensity;
  const note = parseOptionalNote(value.note, bad);
  if (note !== undefined) workout.note = note;
  if (value.planId !== undefined) {
    if (!isId(value.planId)) throw bad();
    workout.planId = value.planId;
  }
  return workout;
}

function parsePlanRecord(value: unknown, index: number): WorkoutPlan {
  const bad = () => invalid(`Schema nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isName(value.type) ||
    !Array.isArray(value.weekdays) ||
    value.weekdays.length === 0 ||
    typeof value.time !== 'string' ||
    !isTime(value.time) ||
    !isDuration(value.durationMin) ||
    !isDate(value.startDate)
  ) {
    throw bad();
  }
  const weekdays: number[] = [];
  for (const d of value.weekdays as unknown[]) {
    if (!isInt(d) || d < 0 || d > 6 || weekdays.includes(d)) throw bad();
    weekdays.push(d);
  }
  const plan: WorkoutPlan = {
    id: value.id,
    type: value.type,
    weekdays: weekdays.sort((a, b) => a - b),
    time: value.time,
    durationMin: value.durationMin,
    startDate: value.startDate,
    ...parseTimes(value, bad),
  };
  const intensity = parseOptionalIntensity(value.intensity, bad);
  if (intensity) plan.intensity = intensity;
  const note = parseOptionalNote(value.note, bad);
  if (note !== undefined) plan.note = note;
  if (value.endDate !== undefined) {
    if (!isDate(value.endDate) || value.endDate < plan.startDate) throw bad();
    plan.endDate = value.endDate;
  }
  return plan;
}

function isDose(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100;
}

function parseMedicationRecord(value: unknown, index: number): Medication {
  const bad = () => invalid(`Läkemedel nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  const frequency = isRecord(value)
    ? DOSE_FREQUENCIES.find((f) => f.id === value.frequency)
    : undefined;
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isName(value.name) ||
    !frequency ||
    typeof value.time !== 'string' ||
    !isTime(value.time) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0
  ) {
    throw bad();
  }
  const steps: Medication['steps'] = [];
  for (const step of value.steps as unknown[]) {
    if (!isRecord(step) || !isDate(step.date) || !isDose(step.doseMg)) throw bad();
    if (steps.some((s) => s.date === step.date)) throw bad();
    steps.push({ date: step.date, doseMg: step.doseMg });
  }
  steps.sort((a, b) => (a.date < b.date ? -1 : 1));
  const med: Medication = {
    id: value.id,
    name: value.name,
    frequency: frequency.id,
    time: value.time,
    steps,
    ...parseTimes(value, bad),
  };
  if (frequency.id === 'vecka') {
    if (!isInt(value.weekday) || value.weekday < 0 || value.weekday > 6) throw bad();
    med.weekday = value.weekday;
  }
  if (value.endDate !== undefined) {
    if (!isDate(value.endDate) || value.endDate < (steps[0]?.date ?? '')) throw bad();
    med.endDate = value.endDate;
  }
  return med;
}

function parseInjectionRecord(value: unknown, index: number): Injection {
  const bad = () => invalid(`Injektion nr ${index + 1} i säkerhetskopian är ogiltig.`);
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isDate(value.date) ||
    !isId(value.medicationId) ||
    !isName(value.medicationName) ||
    !isDose(value.doseMg)
  ) {
    throw bad();
  }
  const injection: Injection = {
    id: value.id,
    date: value.date,
    medicationId: value.medicationId,
    medicationName: value.medicationName,
    doseMg: value.doseMg,
    ...parseTimes(value, bad),
  };
  if (value.time !== undefined) {
    if (typeof value.time !== 'string' || !isTime(value.time)) throw bad();
    injection.time = value.time;
  }
  if (value.site !== undefined) {
    if (!isInjectionSite(value.site)) throw bad();
    injection.site = value.site;
  }
  return injection;
}

function parseSymptomRecord(value: unknown, index: number): SymptomEntry {
  const bad = () => invalid(`Mående nr ${index + 1} i säkerhetskopian är ogiltigt.`);
  if (!isRecord(value) || !Array.isArray(value.sideEffects) || value.sideEffects.length > 50) {
    throw bad();
  }
  const sideEffects: string[] = [];
  for (const effect of value.sideEffects as unknown[]) {
    if (!isName(effect) || sideEffects.includes(effect)) throw bad();
    sideEffects.push(effect);
  }
  const entry: SymptomEntry = { ...parseDailyTimes(value, bad), sideEffects };
  if (value.appetite !== undefined) {
    if (!isInt(value.appetite) || value.appetite < APPETITE_MIN || value.appetite > APPETITE_MAX)
      throw bad();
    entry.appetite = value.appetite;
  }
  return entry;
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

function assertUniqueKeys<T>(entries: readonly T[], keyOf: (entry: T) => string, what: string) {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) throw invalid(`Samma ${what} förekommer flera gånger i säkerhetskopian.`);
    seen.add(key);
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

/** Näringsvärde: 0 eller mer (per 100 g är 900 kcal fett det högsta rimliga). */
function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 10_000;
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isSteps(value: unknown): value is number {
  return isInt(value) && value >= 0;
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
function aad(version: number): Bytes {
  return new TextEncoder().encode(`${BACKUP_FORMAT}:${String(version)}`);
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
