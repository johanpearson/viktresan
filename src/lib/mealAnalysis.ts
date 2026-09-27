/**
 * Lokal analys av en måltid, en dag eller vilka poster som helst: summor av energi,
 * makron, fiber, socker, salt, vitaminer och mineraler, i procent av dagsmålen och
 * av referensintaget (RI), samt nyckeltal. Rena funktioner utan I/O.
 *
 * Energi och makron finns i varje loggpost. Övriga näringsämnen finns bara för
 * Livsmedelsverkets livsmedel (även som ingredienser i en sparad måltid) och slås
 * upp i databasen – för andra poster är de okända, och `coverage` säger hur stor
 * del av mängden summan bygger på.
 */
import {
  MACRO_RI,
  NUTRIENTS,
  type ExtraNutrients,
  type NutrientGroup,
  type NutrientKey,
  type NutrientUnit,
} from '../data/nutrients.ts';
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { mealFoodId } from './foodCatalog.ts';
import { scaleNutrients, sumNutrients, type Nutrients } from './nutrition.ts';

/** En del av en post: posten själv, eller en ingrediens i en loggad sparad måltid. */
export interface AnalysisPart {
  foodId: string;
  grams: number;
  per100: Nutrients;
  extra: ExtraNutrients | null;
}

/** Övriga näringsämnen per livsmedels-id (Livsmedelsverkets data). */
export type ExtraLookup = (foodId: string) => ExtraNutrients | null | undefined;

/**
 * Posten uppdelad i delar med näringsvärden. En loggad sparad måltid delas upp i
 * ingredienserna (skalade efter loggad mängd) så att deras fiber, vitaminer m.m.
 * kan slås upp; saknas måltiden räknas posten som en helhet.
 */
export function partsOf(
  entry: FoodLogEntry,
  meals: readonly SavedMeal[],
  lookup: ExtraLookup,
): AnalysisPart[] {
  if (entry.foodId.startsWith('maltid:')) {
    const meal = meals.find((m) => mealFoodId(m.id) === entry.foodId);
    const totalG = meal?.items.reduce((s, i) => s + i.grams, 0) ?? 0;
    if (meal && totalG > 0) {
      const factor = entry.grams / totalG;
      return meal.items.map((item) => ({
        foodId: item.foodId,
        grams: item.grams * factor,
        per100: item.per100,
        extra: lookup(item.foodId) ?? null,
      }));
    }
  }
  return [
    {
      foodId: entry.foodId,
      grams: entry.grams,
      per100: entry.per100,
      extra: lookup(entry.foodId) ?? null,
    },
  ];
}

export type AnalysisKey = keyof Nutrients | NutrientKey;

export interface NutrientRow {
  key: AnalysisKey;
  label: string;
  unit: NutrientUnit | 'kcal';
  group: 'energi' | NutrientGroup;
  amount: number;
  /** Andel av det personliga dagsmålet (kcal, protein), annars `null`. */
  pctGoal: number | null;
  /** Andel av referensintaget, `null` utan RI. */
  pctRi: number | null;
  ri: number | null;
  /** Var RI kommer ifrån om det inte är EU:s referensintag (t.ex. "NNR"). */
  riSource?: string;
  /** Andel (0–1) av mängden där värdet är känt. 1 för energi och makron. */
  coverage: number;
}

export interface Goals {
  targetKcal: number | null;
  proteinGoalG: number | null;
}

export interface Analysis {
  totals: Nutrients;
  rows: NutrientRow[];
  /** Gram protein per 100 kcal, `null` utan energi. */
  proteinPer100Kcal: number | null;
  /** Gram fiber per 1 000 kcal, `null` utan energi eller fiberdata. */
  fiberPer1000Kcal: number | null;
  /** Andel av dagens kalorimål, `null` utan mål. */
  shareOfTarget: number | null;
  entryCount: number;
  /** Delar utan fiber-, vitamin- och mineraldata. */
  partsWithoutExtra: number;
  parts: number;
}

function pct(amount: number, of: number | null): number | null {
  return of !== null && of > 0 ? amount / of : null;
}

const MACROS: readonly {
  key: keyof Nutrients;
  label: string;
  unit: 'kcal' | 'g';
  ri: number;
}[] = [
  { key: 'kcal', label: 'Energi', unit: 'kcal', ri: MACRO_RI.kcal },
  { key: 'proteinG', label: 'Protein', unit: 'g', ri: MACRO_RI.proteinG },
  { key: 'carbsG', label: 'Kolhydrater', unit: 'g', ri: MACRO_RI.carbsG },
  { key: 'fatG', label: 'Fett', unit: 'g', ri: MACRO_RI.fatG },
];

/**
 * Analyserar posterna. Näringsämnen som inte är kända för någon del utelämnas.
 * Ordning: energi och makron, fiber/socker/salt, vitaminer, mineraler.
 */
export function analyzeEntries(
  entries: readonly FoodLogEntry[],
  meals: readonly SavedMeal[],
  lookup: ExtraLookup,
  goals: Goals,
): Analysis {
  const parts = entries.flatMap((e) => partsOf(e, meals, lookup));
  const totals = sumNutrients(parts.map((p) => scaleNutrients(p.per100, p.grams)));
  const totalGrams = parts.reduce((s, p) => s + p.grams, 0);

  const rows: NutrientRow[] = MACROS.map((m) => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    group: 'energi',
    amount: totals[m.key],
    pctGoal:
      m.key === 'kcal'
        ? pct(totals.kcal, goals.targetKcal)
        : m.key === 'proteinG'
          ? pct(totals.proteinG, goals.proteinGoalG)
          : null,
    pctRi: pct(totals[m.key], m.ri),
    ri: m.ri,
    coverage: 1,
  }));

  for (const info of NUTRIENTS) {
    let amount = 0;
    let knownGrams = 0;
    for (const part of parts) {
      const value = part.extra?.[info.key];
      if (value === undefined) continue;
      amount += (value * part.grams) / 100;
      knownGrams += part.grams;
    }
    if (knownGrams <= 0) continue;
    const row: NutrientRow = {
      key: info.key,
      label: info.label,
      unit: info.unit,
      group: info.group,
      amount,
      pctGoal: null,
      pctRi: pct(amount, info.ri),
      ri: info.ri,
      coverage: totalGrams > 0 ? knownGrams / totalGrams : 0,
    };
    if (info.riSource !== undefined) row.riSource = info.riSource;
    rows.push(row);
  }

  const fiber = rows.find((r) => r.key === 'fiberG');
  return {
    totals,
    rows,
    proteinPer100Kcal: totals.kcal > 0 ? (totals.proteinG / totals.kcal) * 100 : null,
    fiberPer1000Kcal: fiber && totals.kcal > 0 ? (fiber.amount / totals.kcal) * 1000 : null,
    shareOfTarget: pct(totals.kcal, goals.targetKcal),
    entryCount: entries.length,
    partsWithoutExtra: parts.filter((p) => p.extra === null).length,
    parts: parts.length,
  };
}

/** Gram fiber per 1 000 kcal som motsvarar rekommendationen (NNR: ca 12–14 g). */
export const FIBER_PER_1000_KCAL_GOAL = 12;

/** Korta, sakliga kommentarer till nyckeltalen. */
export function keyFigureNotes(analysis: Analysis): string[] {
  const notes: string[] = [];
  const p = analysis.proteinPer100Kcal;
  if (p !== null) {
    if (p >= 15) notes.push('Proteinrikt – bra för mättnaden.');
    else if (p < 5) notes.push('Lite protein i förhållande till energin.');
  }
  const f = analysis.fiberPer1000Kcal;
  if (f !== null) {
    if (f >= FIBER_PER_1000_KCAL_GOAL) notes.push('Fiberrikt – i nivå med rekommendationen.');
    else if (f < FIBER_PER_1000_KCAL_GOAL / 2) notes.push('Lite fiber i förhållande till energin.');
  }
  return notes;
}
