import { describe, expect, it, vi } from 'vitest';
import { lookupOpenFoodFacts, normalizeEan, offProductUrl, parseOffProduct } from './barcode.ts';

describe('normalizeEan', () => {
  it('godkänner EAN-13, EAN-8, UPC-A och GTIN-14 med rätt kontrollsiffra', () => {
    expect(normalizeEan('4006381333931')).toBe('4006381333931');
    expect(normalizeEan('4 006381 333931')).toBe('4006381333931');
    expect(normalizeEan('73513537')).toBe('73513537');
    expect(normalizeEan('036000291452')).toBe('036000291452');
    expect(normalizeEan('10012345678902')).toBe('10012345678902');
  });

  it('avvisar fel kontrollsiffra, fel längd och annat än siffror', () => {
    expect(normalizeEan('4006381333932')).toBeNull();
    expect(normalizeEan('12345')).toBeNull();
    expect(normalizeEan('40063813339a1')).toBeNull();
    expect(normalizeEan('')).toBeNull();
  });
});

describe('parseOffProduct', () => {
  const ean = '4006381333931';

  it('tolkar namn, varumärke, näringsvärden och portion', () => {
    const food = parseOffProduct(ean, {
      status: 1,
      product: {
        product_name: 'Oat flakes',
        product_name_sv: 'Havregryn',
        brands: 'Kungsörnen, Lantmännen',
        serving_quantity: '40',
        nutriments: {
          'energy-kcal_100g': 370.4,
          proteins_100g: 13,
          carbohydrates_100g: '59',
          fat_100g: 7,
        },
      },
    });
    expect(food).toEqual({
      id: `off:${ean}`,
      name: 'Havregryn (Kungsörnen)',
      source: 'openfoodfacts',
      ean,
      per100: { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 },
      units: [{ name: 'portion', grams: 40, source: 'openfoodfacts' }],
    });
  });

  it('räknar om kJ till kcal när kcal saknas och sätter saknade makron till 0', () => {
    const food = parseOffProduct(ean, {
      status: 1,
      product: { product_name: 'Saft', nutriments: { 'energy-kj_100g': 418.4 } },
    });
    expect(food?.per100).toEqual({ kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(food?.units).toBeUndefined();
  });

  it('null om produkten saknas eller saknar energi', () => {
    expect(parseOffProduct(ean, { status: 0, status_verbose: 'product not found' })).toBeNull();
    expect(parseOffProduct(ean, { status: 1, product: { product_name: 'X' } })).toBeNull();
    expect(parseOffProduct(ean, null)).toBeNull();
  });

  it('serving_size blir enheten portion när den går att tolka till gram', () => {
    const product = (extra: Record<string, unknown>) =>
      parseOffProduct(ean, {
        status: 1,
        product: { product_name: 'X', nutriments: { 'energy-kcal_100g': 50 }, ...extra },
      });
    expect(product({ serving_size: '1 portion (30 g)', serving_quantity: 30 })?.units).toEqual([
      { name: 'portion', grams: 30, source: 'openfoodfacts' },
    ]);
    // Volym räknas inte om till gram.
    expect(
      product({ serving_size: '250 ml', serving_quantity: 250, serving_quantity_unit: 'ml' })
        ?.units,
    ).toBeUndefined();
  });

  it('använder streckkoden som namn om namn saknas', () => {
    const food = parseOffProduct(ean, {
      status: 1,
      product: { nutriments: { 'energy-kcal_100g': 50 } },
    });
    expect(food?.name).toBe(`Produkt ${ean}`);
  });
});

describe('lookupOpenFoodFacts', () => {
  const ean = '4006381333931';

  function respond(status: number, body: unknown) {
    return vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
  }

  it('hämtar produkten från world.openfoodfacts.org', async () => {
    const fetchFn = respond(200, {
      status: 1,
      product: { product_name: 'Test', nutriments: { 'energy-kcal_100g': 100 } },
    });
    const result = await lookupOpenFoodFacts(ean, fetchFn);
    expect(result).toMatchObject({ kind: 'found', food: { name: 'Test' } });
    expect(fetchFn).toHaveBeenCalledWith(offProductUrl(ean), expect.anything());
    expect(offProductUrl(ean)).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\//);
  });

  it('saknad produkt (404 eller status 0)', async () => {
    expect(await lookupOpenFoodFacts(ean, respond(404, { status: 0 }))).toEqual({
      kind: 'not-found',
    });
    expect(await lookupOpenFoodFacts(ean, respond(200, { status: 0 }))).toEqual({
      kind: 'not-found',
    });
  });

  it('nätverksfel och serverfel ger ett felmeddelande', async () => {
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await lookupOpenFoodFacts(ean, offline)).toMatchObject({ kind: 'error' });
    expect(await lookupOpenFoodFacts(ean, respond(500, {}))).toMatchObject({ kind: 'error' });
    const garbage = vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>')));
    expect(await lookupOpenFoodFacts(ean, garbage)).toMatchObject({ kind: 'error' });
  });
});
