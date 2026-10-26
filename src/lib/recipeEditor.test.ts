import { describe, expect, it } from 'vitest';
import type { FiberSource } from './fiber.ts';
import type { FoodItem } from './foodSearch.ts';
import {
  countedItems,
  editorTotals,
  newRow,
  openRows,
  rememberedMatches,
  rowsFromImport,
  rowsFromItems,
  rowsSummary,
  withPick,
  type EditorRow,
} from './recipeEditor.ts';
import { buildIndex } from './foodSearch.ts';
import { buildImportRows, type ImportedRecipe } from './recipeImport.ts';

const MJOL: FoodItem = {
  id: 'lv:1',
  name: 'Vetemjöl',
  source: 'livsmedelsverket',
  per100: { kcal: 340, proteinG: 10, carbsG: 70, fatG: 1.5 },
  extra: { fiberG: 3 },
};
const KYCKLING: FoodItem = {
  id: 'lv:2',
  name: 'Kyckling bröstfilé rå',
  source: 'livsmedelsverket',
  per100: { kcal: 110, proteinG: 23, carbsG: 0, fatG: 1.5 },
};
const LINSER: FoodItem = {
  id: 'lv:3',
  name: 'Linser röda torkade',
  source: 'livsmedelsverket',
  per100: { kcal: 300, proteinG: 24, carbsG: 45, fatG: 2 },
  extra: { fiberG: 11 },
};
const SALT: FoodItem = {
  id: 'lv:4',
  name: 'Salt',
  source: 'livsmedelsverket',
  per100: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
};

const CATALOG = new Map([MJOL, KYCKLING, LINSER, SALT].map((f) => [f.id, f]));
const FIBER: FiberSource = { meals: [], lookup: (id) => CATALOG.get(id)?.extra };

let n = 0;
const key = () => `k${String(++n)}`;

function grams(food: FoodItem, g: number): EditorRow {
  return newRow(key(), food, { amount: g, unit: 'g', grams: g }, []);
}

describe('receptets redigeringsvy', () => {
  it('räknar totaler och per portion – och räknar om när rader ändras', () => {
    const rows = [grams(MJOL, 200), grams(KYCKLING, 500)];
    const before = editorTotals(rows, { servings: 4, cookedWeightG: null }, FIBER);
    // 200 g mjöl = 680 kcal, 20 g protein, 6 g fiber; 500 g kyckling = 550 kcal, 115 g protein.
    expect(before.total.kcal).toBeCloseTo(1230);
    expect(before.perPortion?.kcal).toBeCloseTo(307.5);
    expect(before.perPortion?.proteinG).toBeCloseTo(33.75);
    // Kycklingen saknar fiberdata: summan är i underkant.
    expect(before.fiber).toEqual({ fiberG: 6, partial: true });
    expect(before.fiberPerPortion?.fiberG).toBeCloseTo(1.5);

    // Ändrad mängd, bytt livsmedel, borttagen rad och en ny rad.
    const [mjol, kyckling] = rows as [EditorRow, EditorRow];
    const changed = [
      { ...mjol, amount: '100' },
      withPick(kyckling, LINSER, { amount: 300, unit: 'g', grams: 300 }, []),
    ];
    const after = editorTotals(changed, { servings: 4, cookedWeightG: null }, FIBER);
    // 100 g mjöl = 340 kcal; 300 g linser = 900 kcal, 72 g protein, 33 g fiber.
    expect(after.total.kcal).toBeCloseTo(1240);
    expect(after.perPortion?.kcal).toBeCloseTo(310);
    expect(after.perPortion?.proteinG).toBeCloseTo(20.5);
    expect(after.fiber).toEqual({ fiberG: 36, partial: false });
    expect(after.fiberPerPortion?.fiberG).toBeCloseTo(9);

    const removed = editorTotals(changed.slice(1), { servings: 3, cookedWeightG: null }, FIBER);
    expect(removed.perPortion?.kcal).toBeCloseTo(300);

    const added = editorTotals(
      [...changed, grams(MJOL, 100)],
      { servings: 4, cookedWeightG: null },
      FIBER,
    );
    expect(added.total.kcal).toBeCloseTo(1580);
  });

  it('rader som inte räknas, saknar livsmedel eller har ogiltig mängd ingår inte', () => {
    const salt = { ...grams(SALT, 5), counted: false };
    const invalid = { ...grams(MJOL, 100), amount: 'mycket' };
    const rows = [grams(KYCKLING, 500), salt, invalid];
    const totals = editorTotals(rows, { servings: 2, cookedWeightG: null }, FIBER);
    expect(totals.items.map((i) => i.foodId)).toEqual(['lv:2']);
    expect(totals.perPortion?.kcal).toBeCloseTo(275);
    // Den ogiltiga raden måste lösas; raden som inte räknas sparas inte.
    expect(openRows(rows)).toEqual([invalid]);
    expect(countedItems(rows)).toHaveLength(1);
  });

  it('tillagad vikt ger per 100 g; utan fiberdatan är fibern okänd', () => {
    const totals = editorTotals([grams(LINSER, 300)], { servings: null, cookedWeightG: 900 }, null);
    expect(totals.yield.per100.kcal).toBeCloseTo(100);
    expect(totals.perPortion).toBeNull();
    expect(totals.fiber).toBeUndefined();
  });

  it('importen: salt och peppar föreslås som "räknas inte", ingen träff saknar livsmedel', () => {
    const recipe: ImportedRecipe = {
      name: 'Gryta',
      servings: 4,
      ingredients: [
        { original: '2 dl vetemjöl', amount: 2, unit: 'dl', name: 'vetemjöl' },
        { original: 'ca 500 g kycklingfilé', amount: 500, unit: 'g', name: 'kycklingfilé' },
        { original: 'salt och peppar efter smak', amount: null, unit: null, name: 'salt' },
      ],
    };
    const foods = [MJOL, SALT];
    const rows = rowsFromImport(
      buildImportRows(recipe, {
        index: buildIndex(foods),
        catalog: new Map(foods.map((f) => [f.id, f])),
        memory: {},
        customUnits: new Map(),
      }),
      new Map(),
      key,
    );
    expect(rows.map((r) => [r.original, r.food?.id ?? null, r.counted])).toEqual([
      ['2 dl vetemjöl', 'lv:1', true],
      ['ca 500 g kycklingfilé', null, true],
      ['salt och peppar efter smak', 'lv:4', false],
    ]);
    // Mjölet räknas om från dl med livsmedlets densitet.
    expect(countedItems(rows)).toEqual([
      expect.objectContaining({ foodId: 'lv:1', unit: 'dl', amount: 2 }),
    ]);
    expect(rowsSummary(rows)).toBe('3 ingredienser · 1 att granska · 1 räknas inte');
    expect(openRows(rows).map((r) => r.original)).toEqual(['ca 500 g kycklingfilé']);

    // Ett val i sök-sheeten löser raden och sparas i matchningsminnet.
    const [, chicken] = rows as [EditorRow, EditorRow, EditorRow];
    const solved = rows.map((r) =>
      r === chicken ? withPick(r, KYCKLING, { amount: 500, unit: 'g', grams: 500 }, []) : r,
    );
    expect(openRows(solved)).toEqual([]);
    expect(rowsSummary(solved)).toBe('3 ingredienser · alla matchade · 1 räknas inte');
    expect(rememberedMatches(solved)).toEqual([{ names: ['kycklingfilé'], foodId: 'lv:2' }]);
  });

  it('ett befintligt recept öppnas med sina enheter som de vägde', () => {
    const rows = rowsFromItems(
      [
        {
          foodId: 'lv:3',
          name: 'Linser',
          amount: 2,
          unit: 'dl',
          grams: 170,
          per100: LINSER.per100,
        },
      ],
      CATALOG,
      new Map(),
      key,
    );
    expect(countedItems(rows)).toEqual([
      expect.objectContaining({ foodId: 'lv:3', amount: 2, unit: 'dl', grams: 170 }),
    ]);
    expect(rowsSummary(rows)).toBe('1 ingrediens');
  });
});
