import { describe, expect, it } from 'vitest';
import {
  foodLabelPrompt,
  matchNutrient,
  parseFoodLabel,
  parseSupplementLabel,
  supplementLabelPrompt,
} from './aiLabel.ts';

const VALID = {
  namn: 'Multi Vuxen',
  enhet: 'tablett',
  mangdPerDos: 1,
  naringsamnen: [
    { amne: 'vitaminD', mangd: 400, enhet: 'IE' },
    { amne: 'Zink', mangd: 10, enhet: 'mg' },
    { amne: 'selenium', mangd: 0.055, enhet: 'mg' },
    { amne: 'vitaminB12', mangd: 2.5, enhet: 'mcg' },
  ],
};

describe('prompten', () => {
  it('ber om enbart JSON och räknar upp schema, ämnen och enheter', () => {
    const prompt = supplementLabelPrompt('4006381333931');
    expect(prompt).toContain('ENDAST');
    expect(prompt).toContain('"naringsamnen"');
    expect(prompt).toContain('vitaminD (Vitamin D, µg eller IE)');
    expect(prompt).toContain('zinc (Zink, mg)');
    expect(prompt).toContain('4006381333931');
    expect(prompt).not.toMatch(/\n\n\n/);
    expect(foodLabelPrompt()).toContain('per 100 g');
  });
});

describe('parseSupplementLabel', () => {
  it('giltigt svar: namn, form, dos och näringsämnen i angiven enhet', () => {
    const result = parseSupplementLabel(JSON.stringify(VALID));
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Multi Vuxen',
        form: 'tablett',
        amountPerDose: 1,
        nutrients: [
          { key: 'vitaminD', amount: 400, unit: 'IE' },
          { key: 'zinc', amount: 10, unit: 'mg' },
          { key: 'selenium', amount: 0.055, unit: 'mg' },
          { key: 'vitaminB12', amount: 2.5, unit: 'µg' },
        ],
      },
      warnings: [],
    });
  });

  it('tål kodblock och text runt JSON, tal som text och pluralformer', () => {
    const text = `Här är svaret:\n\`\`\`json\n${JSON.stringify({
      ...VALID,
      enhet: 'Kapslar',
      mangdPerDos: '2',
      naringsamnen: [{ amne: 'D-vitamin', mangd: '12,5', enhet: 'µg' }],
    })}\n\`\`\``;
    const result = parseSupplementLabel(text);
    expect(result.ok && result.value).toEqual({
      name: 'Multi Vuxen',
      form: 'kapsel',
      amountPerDose: 2,
      nutrients: [{ key: 'vitaminD', amount: 12.5, unit: 'µg' }],
    });
  });

  it('okända ämnen hoppas över med en varning', () => {
    const result = parseSupplementLabel(
      JSON.stringify({ ...VALID, naringsamnen: [{ amne: 'Omega-3', mangd: 500, enhet: 'mg' }] }),
    );
    expect(result.ok && result.value.nutrients).toEqual([]);
    expect(result.ok && result.warnings[0]).toMatch(/Omega-3/);
  });

  it('ogiltig JSON ger ett tydligt fel', () => {
    expect(parseSupplementLabel('')).toEqual({
      ok: false,
      error: 'Klistra in AI-tjänstens svar först.',
    });
    expect(parseSupplementLabel('Jag kan inte läsa bilden.')).toMatchObject({
      ok: false,
      error: expect.stringContaining('ingen JSON') as string,
    });
    expect(parseSupplementLabel('{"namn": "D", "enhet": }')).toMatchObject({
      ok: false,
      error: expect.stringContaining('inte giltig JSON') as string,
    });
    expect(parseSupplementLabel('[1, 2]')).toMatchObject({ ok: false });
  });

  it('saknade fält', () => {
    const rest: Record<string, unknown> = { ...VALID };
    delete rest.mangdPerDos;
    delete rest.naringsamnen;
    expect(parseSupplementLabel(JSON.stringify(rest))).toEqual({
      ok: false,
      error: 'Fält saknas i svaret: mangdPerDos, naringsamnen.',
    });
    expect(
      parseSupplementLabel(JSON.stringify({ ...VALID, naringsamnen: [{ amne: 'zinc' }] })),
    ).toEqual({ ok: false, error: 'Näringsämne 1: fält saknas: mangd, enhet.' });
  });

  it('fel enheter och fel värden', () => {
    const withNutrient = (n: Record<string, unknown>) =>
      parseSupplementLabel(JSON.stringify({ ...VALID, naringsamnen: [n] }));
    expect(withNutrient({ amne: 'zinc', mangd: 10, enhet: 'IE' })).toEqual({
      ok: false,
      error: 'Zink: fel enhet "IE" – använd mg eller µg.',
    });
    expect(withNutrient({ amne: 'vitaminD', mangd: 10, enhet: 'kg' })).toEqual({
      ok: false,
      error: 'Vitamin D: fel enhet "kg" – använd µg eller IE.',
    });
    expect(withNutrient({ amne: 'zinc', mangd: -1, enhet: 'mg' })).toMatchObject({ ok: false });
    expect(parseSupplementLabel(JSON.stringify({ ...VALID, enhet: 'spruta' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('"enhet"') as string,
    });
    expect(parseSupplementLabel(JSON.stringify({ ...VALID, mangdPerDos: 0 }))).toMatchObject({
      ok: false,
    });
    expect(parseSupplementLabel(JSON.stringify({ ...VALID, namn: 42 }))).toMatchObject({
      ok: false,
    });
  });

  it('matchar ämnen på id och namn', () => {
    expect(matchNutrient('vitaminD')).toBe('vitaminD');
    expect(matchNutrient('Vitamin D')).toBe('vitaminD');
    expect(matchNutrient('D-vitamin')).toBe('vitaminD');
    expect(matchNutrient('B1')).toBe('thiamin');
    expect(matchNutrient('Järn')).toBe('iron');
    expect(matchNutrient('Biotin')).toBeNull();
  });
});

describe('parseFoodLabel', () => {
  it('giltigt svar per 100 g', () => {
    expect(
      parseFoodLabel(
        '{"namn":"Knäcke","energiKcal":350.4,"proteinG":9,"kolhydraterG":62,"fettG":2}',
      ),
    ).toEqual({
      ok: true,
      value: { name: 'Knäcke', kcal: 350, proteinG: 9, carbsG: 62, fatG: 2 },
      warnings: [],
    });
  });

  it('valfria fält: fiber, socker och portion (null = saknas)', () => {
    expect(
      parseFoodLabel(
        '{"namn":"Knäcke","energiKcal":350,"proteinG":9,"kolhydraterG":62,"fettG":2,"fiberG":"16,5","sockerG":1.5,"portionG":12}',
      ),
    ).toEqual({
      ok: true,
      value: {
        name: 'Knäcke',
        kcal: 350,
        proteinG: 9,
        carbsG: 62,
        fatG: 2,
        fiberG: 16.5,
        sugarG: 1.5,
        portionG: 12,
      },
      warnings: [],
    });
    const partial = parseFoodLabel(
      '{"namn":"X","energiKcal":50,"proteinG":1,"kolhydraterG":10,"fettG":0,"fiberG":null,"sockerG":"mycket","portionG":0}',
    );
    expect(partial).toEqual({
      ok: true,
      value: { name: 'X', kcal: 50, proteinG: 1, carbsG: 10, fatG: 0 },
      warnings: [
        'Hoppade över "sockerG" – inte ett tal.',
        'Hoppade över "portionG" – orimlig portion.',
      ],
    });
  });

  it('saknade fält och orimliga värden', () => {
    expect(parseFoodLabel('{"namn":"X","energiKcal":1}')).toEqual({
      ok: false,
      error: 'Fält saknas i svaret: proteinG, kolhydraterG, fettG.',
    });
    expect(
      parseFoodLabel('{"namn":"X","energiKcal":2000,"proteinG":9,"kolhydraterG":62,"fettG":2}'),
    ).toMatchObject({ ok: false, error: expect.stringContaining('per 100 g') as string });
    expect(
      parseFoodLabel('{"namn":"X","energiKcal":"mycket","proteinG":9,"kolhydraterG":6,"fettG":2}'),
    ).toEqual({ ok: false, error: '"energiKcal" ska vara ett tal (0 eller mer).' });
  });
});

describe('avbrutet svar', () => {
  it('ett svar utan avslutande } är ogiltig JSON, inte "ingen JSON"', () => {
    expect(parseSupplementLabel('{"namn": "D-vitamin", "enhet": ')).toMatchObject({
      ok: false,
      error: expect.stringContaining('inte giltig JSON') as string,
    });
  });
});
