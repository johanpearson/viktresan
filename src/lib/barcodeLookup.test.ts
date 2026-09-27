import { describe, expect, it, vi } from 'vitest';
import type { SavedMeal, StoredFood, Supplement } from '../db/db.ts';
import { lookupBarcode, type LocalLookup } from './barcodeLookup.ts';

const EAN = '4006381333931';

const FOOD: StoredFood = {
  id: 'egen:1',
  name: 'Knäcke',
  source: 'egen',
  per100: { kcal: 350, proteinG: 9, carbsG: 62, fatG: 2 },
  ean: EAN,
  createdAt: 1,
};
const MEAL: SavedMeal = { id: 'm1', name: 'Matlåda', items: [], ean: EAN, createdAt: 1 };
const SUPPLEMENT: Supplement = {
  id: 's1',
  name: 'D-vitamin',
  form: 'tablett',
  amountPerDose: 1,
  nutrients: [{ key: 'vitaminD', amount: 25, unit: 'µg' }],
  schedule: 'dagligen',
  dosesPerDay: 1,
  ean: EAN,
  createdAt: 1,
};

function local(hits: {
  food?: StoredFood;
  meal?: SavedMeal;
  supplement?: Supplement;
}): LocalLookup {
  return {
    food: (ean) => Promise.resolve(ean === EAN ? (hits.food ?? null) : null),
    meal: (ean) => Promise.resolve(ean === EAN ? (hits.meal ?? null) : null),
    supplement: (ean) => Promise.resolve(ean === EAN ? (hits.supplement ?? null) : null),
  };
}

function offResponse(product: Record<string, unknown> | null) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      product
        ? new Response(JSON.stringify({ status: 1, product }), { status: 200 })
        : new Response('{"status":0}', { status: 404 }),
    ),
  );
}

const options = { supplementsEnabled: true, foodEnabled: true };

describe('lookupBarcode – lokalt före Open Food Facts', () => {
  it('lokalt livsmedel i Mat: inga nätverksanrop', async () => {
    const fetchFn = offResponse({});
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'mat',
      local: local({ food: FOOD }),
      fetchFn,
    });
    expect(result).toEqual({ kind: 'food', food: FOOD });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('egen måltid med streckkod hittas lokalt', async () => {
    const fetchFn = offResponse({});
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'mat',
      local: local({ meal: MEAL }),
      fetchFn,
    });
    expect(result).toEqual({ kind: 'meal', meal: MEAL });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('lokalt tillskott under Tillskott: inga nätverksanrop', async () => {
    const fetchFn = offResponse({});
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'tillskott',
      local: local({ supplement: SUPPLEMENT, food: FOOD }),
      fetchFn,
    });
    expect(result).toEqual({ kind: 'supplement', supplement: SUPPLEMENT });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('inget lokalt → Open Food Facts', async () => {
    const fetchFn = offResponse({
      product_name: 'Müsli',
      nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10 },
    });
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'mat',
      local: local({}),
      fetchFn,
    });
    expect(result).toMatchObject({ kind: 'off-food', food: { name: 'Müsli', ean: EAN } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain(`/product/${EAN}.json`);
  });

  it('Tillskott: förifyllning per portion ur Open Food Facts', async () => {
    const fetchFn = offResponse({
      product_name: 'D3 Forte',
      nutriments: { 'vitamin-d_serving': 0.00005, zinc_serving: 0.01, 'vitamin-c_100g': 1 },
    });
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'tillskott',
      local: local({}),
      fetchFn,
    });
    expect(result).toEqual({
      kind: 'off-supplement',
      prefill: {
        name: 'D3 Forte',
        nutrients: [
          { key: 'vitaminD', amount: 50, unit: 'µg' },
          { key: 'zinc', amount: 10, unit: 'mg' },
        ],
      },
    });
  });

  it('ingen träff någonstans', async () => {
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'tillskott',
      local: local({}),
      fetchFn: offResponse(null),
    });
    expect(result).toEqual({ kind: 'not-found', ean: EAN });
  });

  it('nätverksfel ger ett fel, inte "hittade inte"', async () => {
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'mat',
      local: local({}),
      fetchFn: vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    });
    expect(result).toMatchObject({ kind: 'error' });
  });
});

describe('lookupBarcode – korsträff Mat/Tillskott', () => {
  it('tillskott skannat i Mat föreslår Tillskott', async () => {
    const fetchFn = offResponse({});
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'mat',
      local: local({ supplement: SUPPLEMENT }),
      fetchFn,
    });
    expect(result).toEqual({ kind: 'elsewhere', target: 'tillskott', name: 'D-vitamin', ean: EAN });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('livsmedel skannat under Tillskott föreslår Mat', async () => {
    const result = await lookupBarcode(EAN, {
      ...options,
      context: 'tillskott',
      local: local({ food: FOOD }),
      fetchFn: offResponse({}),
    });
    expect(result).toEqual({ kind: 'elsewhere', target: 'mat', name: 'Knäcke', ean: EAN });
  });

  it('avstängd funktion räknas inte som korsträff', async () => {
    const fetchFn = offResponse(null);
    const result = await lookupBarcode(EAN, {
      context: 'mat',
      supplementsEnabled: false,
      foodEnabled: true,
      local: local({ supplement: SUPPLEMENT }),
      fetchFn,
    });
    expect(result).toEqual({ kind: 'not-found', ean: EAN });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
