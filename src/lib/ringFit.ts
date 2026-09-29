/**
 * Text i ringar (`GoalRing`): texten ska alltid rymmas inom ringens inre cirkel med marginal.
 * Rena beräkningar – mätningen i DOM:en görs av `useRingFit`.
 */

/** Ringens geometri i viewBox-enheter (0 0 96 96). */
export const RING_VIEWBOX = 96;
export const RING_RADIUS = 42;
export const RING_STROKE = 8;

/** Luft mellan texten och ringens insida, i px. */
export const RING_TEXT_MARGIN = 2;

/** Enheten ("g", "l") står i 0,8 × siffrans storlek (`.goal-ring-unit` i index.css). */
export const RING_UNIT_RATIO = 0.8;

/** Inre radie (px) för en ring med given diameter (px): mitten av linjen minus halva linjebredden. */
export function innerRadius(diameter: number): number {
  return (diameter * (RING_RADIUS - RING_STROKE / 2)) / RING_VIEWBOX;
}

/** En textrad i ringen, uppmätt vid bastorleken. */
export interface RingLine {
  /** Bredd per px teckenstorlek (bredd ÷ teckenstorlek). */
  widthPerPx: number;
  /** Radhöjd per px teckenstorlek (line-height ÷ teckenstorlek). */
  heightPerPx: number;
  /** Teckenstorlek utan krympning, px. */
  basePx: number;
  /** Radens minsta teckenstorlek, px (en rad med enhet: så att enheten inte blir mindre än min-storleken). */
  minPx: number;
}

/** Teckenstorleken för en rad vid en skala: aldrig under min-storleken (eller basen om den är mindre). */
export function lineSizePx(line: RingLine, scale: number): number {
  return Math.max(Math.min(line.minPx, line.basePx), line.basePx * scale);
}

/**
 * Ryms raderna (staplade, centrerade) i en cirkel med radien `radius`? Varje rads ytterhörn –
 * halva bredden och radens kant längst från mitten – ska ligga inom cirkeln.
 */
export function linesFit(lines: readonly RingLine[], sizes: readonly number[], radius: number) {
  if (radius <= 0) return false;
  const heights = lines.map((l, i) => l.heightPerPx * (sizes[i] ?? 0));
  const total = heights.reduce((a, b) => a + b, 0);
  let top = -total / 2;
  return lines.every((line, i) => {
    const height = heights[i] ?? 0;
    const bottom = top + height;
    const y = Math.max(Math.abs(top), Math.abs(bottom));
    top = bottom;
    const halfWidth = (line.widthPerPx * (sizes[i] ?? 0)) / 2;
    return halfWidth * halfWidth + y * y <= radius * radius;
  });
}

/**
 * Största skala (≤ 1) där ringens text ryms med marginal. Alla rader krymps med samma skala men
 * aldrig under sin `minPx`. Ryms texten inte ens vid min-storleken blir skalan den lägsta möjliga
 * (texten beskärs då av ringens inre cirkel i CSS i stället för att gå utanför).
 */
export function ringTextScale(
  lines: readonly RingLine[],
  diameter: number,
  margin = RING_TEXT_MARGIN,
): number {
  const valid = lines.filter((l) => l.basePx > 0 && l.widthPerPx > 0);
  if (valid.length === 0 || diameter <= 0) return 1;
  const radius = innerRadius(diameter) - margin;
  const fits = (scale: number) =>
    linesFit(
      valid,
      valid.map((l) => lineSizePx(l, scale)),
      radius,
    );
  if (fits(1)) return 1;
  // Under den skala där alla rader nått min-storleken ändras ingenting.
  const floor = Math.min(...valid.map((l) => Math.min(l.minPx, l.basePx) / l.basePx));
  if (!fits(floor)) return floor;
  let lo = floor;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** En rad ringar har samma textstorlek: skalan för den ring som behöver krympa mest. */
export function rowTextScale(scales: readonly number[]): number {
  return scales.length === 0 ? 1 : Math.min(1, ...scales);
}
