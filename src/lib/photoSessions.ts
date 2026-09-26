/**
 * Fototillfällen och vinklar: rena funktioner för galleriet, jämförelsen och
 * kameravyns spökbild. Ingen I/O – databasen ligger i `db.ts`.
 */
import type { PhotoEntry, PhotoSession } from '../db/db.ts';
import { daysBetween } from './dates.ts';
import { dailyWeights, emaTrend, roundKg, type DatedWeight } from './stats.ts';

/** Vinkel för en bild. `okand` = migrerad bild där vinkeln inte är angiven än. */
export type PhotoAngle = 'fram' | 'profil' | 'okand';
/** Vinklar som tas i ett fototillfälle, i guidens ordning. */
export type CaptureAngle = Exclude<PhotoAngle, 'okand'>;
/** Vilken sida som vänds mot kameran i profilbilder (Inställningar → Bilder). */
export type ProfileSide = 'vanster' | 'hoger';

export const CAPTURE_ANGLES: readonly CaptureAngle[] = ['fram', 'profil'];
export const PHOTO_ANGLES: readonly PhotoAngle[] = ['fram', 'profil', 'okand'];
export const PROFILE_SIDES: readonly ProfileSide[] = ['vanster', 'hoger'];

export const ANGLE_LABELS: Record<PhotoAngle, string> = {
  fram: 'Framifrån',
  profil: 'Profil',
  okand: 'Ej angiven',
};

export const SIDE_LABELS: Record<ProfileSide, string> = {
  vanster: 'Vänster sida',
  hoger: 'Höger sida',
};

export function isPhotoAngle(value: unknown): value is PhotoAngle {
  return typeof value === 'string' && (PHOTO_ANGLES as readonly string[]).includes(value);
}

export function isProfileSide(value: unknown): value is ProfileSide {
  return typeof value === 'string' && (PROFILE_SIDES as readonly string[]).includes(value);
}

/** Id för tillfället som migrerade bilder från ett visst datum hamnar i (samma på alla enheter). */
export function legacySessionId(date: string): string {
  return `migrerad:${date}`;
}

/** Vinkeltext för bildtexter: "Profil (vänster sida)". */
export function angleText(photo: Pick<PhotoEntry, 'angle' | 'side'>): string {
  if (photo.angle === 'profil' && photo.side) {
    return `${ANGLE_LABELS.profil} (${SIDE_LABELS[photo.side].toLowerCase()})`;
  }
  return ANGLE_LABELS[photo.angle];
}

/** Nyast först: datum, sedan registreringstid. */
function newestFirst<T extends { date: string; createdAt: number }>(a: T, b: T): number {
  return a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1;
}

/**
 * Tillfällen för alla bilder: sparade tillfällen plus ett ersättningstillfälle för
 * bilder vars tillfälle saknas (t.ex. data skriven utanför appen). Tillfällen utan
 * bilder tas med – de filtreras bort av `sessionRows`.
 */
export function ensureSessions(
  sessions: readonly PhotoSession[],
  photos: readonly Pick<PhotoEntry, 'sessionId' | 'date' | 'createdAt'>[],
): PhotoSession[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  for (const photo of photos) {
    if (!byId.has(photo.sessionId)) {
      byId.set(photo.sessionId, {
        id: photo.sessionId,
        date: photo.date,
        createdAt: photo.createdAt,
      });
    }
  }
  return [...byId.values()];
}

/** En rad i galleriet: ett tillfälle och dess bilder per vinkel (nyast först inom vinkeln). */
export interface SessionRow<P extends PhotoEntry = PhotoEntry> {
  session: PhotoSession;
  fram: P[];
  profil: P[];
  okand: P[];
}

/** Grupperar bilderna per tillfälle, nyaste tillfället först. Tillfällen utan bilder utelämnas. */
export function sessionRows<P extends PhotoEntry>(
  sessions: readonly PhotoSession[],
  photos: readonly P[],
): SessionRow<P>[] {
  const rows = new Map<string, SessionRow<P>>();
  for (const session of ensureSessions(sessions, photos)) {
    rows.set(session.id, { session, fram: [], profil: [], okand: [] });
  }
  for (const photo of [...photos].sort(newestFirst)) {
    rows.get(photo.sessionId)?.[photo.angle].push(photo);
  }
  return [...rows.values()]
    .filter((r) => r.fram.length + r.profil.length + r.okand.length > 0)
    .sort((a, b) => newestFirst(a.session, b.session));
}

/** Bilderna i en vinkel över tid, nyast först. */
export function photosWithAngle<P extends PhotoEntry>(
  photos: readonly P[],
  angle: PhotoAngle,
): P[] {
  return photos.filter((p) => p.angle === angle).sort(newestFirst);
}

/** Den bild i en vinkel som visas för tillfället (den senast tagna), eller null. */
export function photoFor<P extends PhotoEntry>(row: SessionRow<P>, angle: CaptureAngle): P | null {
  return row[angle][0] ?? null;
}

/**
 * Spökbilden i kameravyn: den senaste bilden i samma vinkel från ett annat tillfälle.
 * För profil föredras samma sida; finns ingen sådan duger en profilbild från den andra.
 * Bilder utan angiven vinkel används aldrig.
 */
export function pickGhost<P extends PhotoEntry>(
  photos: readonly P[],
  angle: CaptureAngle,
  side: ProfileSide,
  excludeSessionId?: string,
): P | null {
  const candidates = photos
    .filter((p) => p.angle === angle && p.sessionId !== excludeSessionId)
    .sort(newestFirst);
  if (angle === 'profil') {
    const sameSide = candidates.find((p) => (p.side ?? side) === side);
    if (sameSide) return sameSide;
  }
  return candidates[0] ?? null;
}

/** Hur långt tillbaka en trendvikt får ligga för att förifyllas (dagar). */
export const TREND_PREFILL_MAX_AGE_DAYS = 7;

/**
 * Trendvikten (EMA) en viss dag, avrundad till en decimal: senaste trendpunkten
 * på eller före dagen, om den är högst en vecka gammal. Annars null.
 */
export function trendWeightOn(weights: readonly DatedWeight[], date: string): number | null {
  const trend = emaTrend(dailyWeights(weights.filter((w) => w.date <= date)));
  const last = trend[trend.length - 1];
  if (!last || daysBetween(last.date, date) > TREND_PREFILL_MAX_AGE_DAYS) return null;
  return roundKg(last.trendKg);
}

/** Trendvikten som förifyllt värde i formulär ("84,2"), eller tom sträng. */
export function trendWeightText(weights: readonly DatedWeight[], date: string): string {
  const kg = trendWeightOn(weights, date);
  return kg == null ? '' : kg.toFixed(1).replace('.', ',');
}

/** Vad som jämförs: en vinkel eller båda under varandra. */
export type CompareAngle = CaptureAngle | 'bada';

export interface SessionComparison {
  before: PhotoSession;
  after: PhotoSession;
  /** Dagar mellan tillfällena. */
  days: number;
  /** Viktskillnad (efter − före) när båda har vikt, annars null. */
  changeKg: number | null;
}

/** Ordnar två tillfällen (äldst = före) och räknar ut dagar och viktskillnad. */
export function compareSessions(a: PhotoSession, b: PhotoSession): SessionComparison {
  const [before, after] = newestFirst(a, b) > 0 ? [a, b] : [b, a];
  return {
    before,
    after,
    days: daysBetween(before.date, after.date),
    changeKg:
      before.weightKg != null && after.weightKg != null
        ? roundKg(after.weightKg - before.weightKg)
        : null,
  };
}

/** Första och senaste tillfället, eller null om det finns färre än två. */
export function firstAndLatest<P extends PhotoEntry>(
  rows: readonly SessionRow<P>[],
): [PhotoSession, PhotoSession] | null {
  const latest = rows[0];
  const first = rows[rows.length - 1];
  return rows.length >= 2 && first && latest ? [first.session, latest.session] : null;
}

/** Förvald vinkel i jämförelsen: den första vinkel som båda tillfällena har, annars båda. */
export function defaultCompareAngle<P extends PhotoEntry>(
  a: SessionRow<P> | undefined,
  b: SessionRow<P> | undefined,
): CompareAngle {
  if (!a || !b) return 'fram';
  return CAPTURE_ANGLES.find((angle) => a[angle].length > 0 && b[angle].length > 0) ?? 'bada';
}
