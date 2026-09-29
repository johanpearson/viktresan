import { describe, expect, it } from 'vitest';
import type { FoodItem } from './foodSearch.ts';
import { buildIndex } from './foodSearch.ts';
import { buildCatalog } from './foodCatalog.ts';
import { rememberMatch } from './matchMemory.ts';
import {
  buildImportRows,
  candidateQueries,
  canonicalUnit,
  confidenceOf,
  findUrl,
  isConfidentMatch,
  isSkippable,
  parseIngredientText,
  parseRecipeImport,
  quantityOf,
  readAmount,
  recipeImportPrompt,
  recipeInput,
  resolveAmount,
  type ImportedRecipe,
} from './recipeImport.ts';

const VALID = {
  namn: 'Kycklinggryta',
  portioner: 4,
  ingredienser: [
    { original: '2 dl vetemjöl', mangd: 2, enhet: 'dl', livsmedel: 'vetemjöl' },
    {
      original: '1 burk krossade tomater (400 g)',
      mangd: 1,
      enhet: 'burk',
      livsmedel: 'krossade tomater',
    },
    { original: 'salt', mangd: null, enhet: null, livsmedel: 'salt' },
  ],
  kallaUrl: 'https://www.ica.se/recept/kycklinggryta-123/',
};

function food(id: string, name: string, kcal: number, extra: Partial<FoodItem> = {}): FoodItem {
  return {
    id,
    name,
    source: id.startsWith('lv:') ? 'livsmedelsverket' : 'egen',
    per100: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
    ...extra,
  };
}

describe('prompten', () => {
  it('länk: ber om ENDAST JSON enligt schemat och tar med länken', () => {
    const prompt = recipeImportPrompt({ kind: 'url', url: 'https://ica.se/recept/x' });
    expect(prompt).toContain('ENDAST');
    for (const key of ['"namn"', '"portioner"', '"ingredienser"', '"original"', '"mangd"']) {
      expect(prompt).toContain(key);
    }
    expect(prompt).toContain('"enhet"');
    expect(prompt).toContain('"livsmedel"');
    expect(prompt).toContain('"kallaUrl"');
    expect(prompt).toContain('Länk: https://ica.se/recept/x');
  });

  it('text tas med i prompten; tomt = bild', () => {
    expect(recipeImportPrompt({ kind: 'text', text: '3 ägg\n2 dl mjölk' })).toContain(
      '3 ägg\n2 dl mjölk',
    );
    expect(recipeImportPrompt({ kind: 'image' })).toContain('bifogar en bild');
  });

  it('tolkar inmatningen: länk (även med rubrik), text eller bild', () => {
    expect(recipeInput('https://www.ica.se/recept/a/')).toEqual({
      kind: 'url',
      url: 'https://www.ica.se/recept/a/',
    });
    expect(recipeInput('Kycklinggryta – ICA https://ica.se/r/1.')).toEqual({
      kind: 'url',
      url: 'https://ica.se/r/1',
    });
    expect(recipeInput('2 dl mjölk\n3 ägg')).toEqual({ kind: 'text', text: '2 dl mjölk\n3 ägg' });
    expect(recipeInput('   ')).toEqual({ kind: 'image' });
    expect(findUrl('ingen länk')).toBeNull();
  });
});

describe('parseRecipeImport', () => {
  it('giltigt svar: namn, portioner, ingredienser och källa', () => {
    const result = parseRecipeImport(JSON.stringify(VALID));
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Kycklinggryta',
        servings: 4,
        ingredients: [
          { original: '2 dl vetemjöl', amount: 2, unit: 'dl', name: 'vetemjöl' },
          {
            original: '1 burk krossade tomater (400 g)',
            amount: 1,
            unit: 'burk',
            name: 'krossade tomater',
          },
          { original: 'salt', amount: null, unit: null, name: 'salt' },
        ],
        sourceUrl: 'https://www.ica.se/recept/kycklinggryta-123/',
      },
      warnings: [],
    });
  });

  it('tål kodblock, text före och mängder som text ("1/2", "0,5")', () => {
    const answer = `Här är receptet:\n\`\`\`json\n${JSON.stringify({
      ...VALID,
      portioner: '4',
      ingredienser: [{ original: '1/2 gul lök', mangd: '1/2', enhet: 'st', livsmedel: 'gul lök' }],
    })}\n\`\`\``;
    const result = parseRecipeImport(answer);
    expect(result.ok && result.value.ingredients[0]?.amount).toBe(0.5);
    expect(result.ok && result.value.servings).toBe(4);
  });

  it('tydliga fel vid ogiltig JSON eller fel schema', () => {
    const error = (text: string) => {
      const r = parseRecipeImport(text);
      return r.ok ? null : r.error;
    };
    expect(error('')).toBe('Klistra in AI-tjänstens svar först.');
    expect(error('Jag kan inte öppna länken.')).toMatch(/ingen JSON/);
    expect(error('{"namn": "x", "ingredienser": [')).toMatch(/inte giltig JSON/);
    expect(error('{"namn": "x"}')).toBe('Fält saknas i svaret: ingredienser.');
    expect(error(JSON.stringify({ ...VALID, namn: 3 }))).toBe('"namn" ska vara en text.');
    expect(error(JSON.stringify({ ...VALID, ingredienser: 'mjöl' }))).toBe(
      '"ingredienser" ska vara en lista.',
    );
    expect(error(JSON.stringify({ ...VALID, ingredienser: [] }))).toBe(
      'Receptet har inga ingredienser.',
    );
    expect(error(JSON.stringify({ ...VALID, portioner: 'många' }))).toMatch(/"portioner"/);
    expect(error(JSON.stringify({ ...VALID, portioner: 500 }))).toBe(
      '"portioner" ska vara högst 50.',
    );
    expect(
      error(JSON.stringify({ ...VALID, ingredienser: [{ original: '2 dl mjölk', mangd: 'två' }] })),
    ).toBe('Ingrediens 1 (2 dl mjölk): "mangd" ska vara ett tal eller null.');
    expect(error(JSON.stringify({ ...VALID, ingredienser: [{ mangd: 2 }] }))).toMatch(
      /Ingrediens 1: "original"/,
    );
  });

  it('saknade portioner och ogiltig källa ger varningar, inte fel', () => {
    const result = parseRecipeImport(
      JSON.stringify({ ...VALID, portioner: null, kallaUrl: 'javascript:alert(1)' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.servings).toBeNull();
    expect(result.value.sourceUrl).toBeUndefined();
    expect(result.warnings).toEqual([
      'Antal portioner saknas i svaret – fyll i det innan du sparar.',
      'Källan är ingen giltig webbadress och sparas inte.',
    ]);
  });

  it('saknas livsmedlets namn används raden utan mängd', () => {
    const result = parseRecipeImport(
      JSON.stringify({ ...VALID, ingredienser: [{ original: '2 dl vetemjöl' }] }),
    );
    expect(result.ok && result.value.ingredients[0]).toEqual({
      original: '2 dl vetemjöl',
      amount: null,
      unit: null,
      name: 'vetemjöl',
    });
  });
});

describe('ingredienstolkning', () => {
  it.each([
    ['2 dl vetemjöl', { amount: 2, unit: 'dl', grams: null, approx: false, name: 'vetemjöl' }],
    [
      '1 burk krossade tomater (400 g)',
      { amount: 1, unit: 'burk', grams: 400, approx: false, name: 'krossade tomater' },
    ],
    ['1/2 gul lök', { amount: 0.5, unit: null, grams: null, approx: false, name: 'gul lök' }],
    [
      'ca 500 g kycklingfilé',
      { amount: 500, unit: 'g', grams: 500, approx: true, name: 'kycklingfilé' },
    ],
    ['1 msk olivolja', { amount: 1, unit: 'msk', grams: null, approx: false, name: 'olivolja' }],
    ['salt', { amount: null, unit: null, grams: null, approx: false, name: 'salt' }],
    [
      '2 burkar kokosmjölk (à 400 ml)',
      { amount: 2, unit: 'burk', grams: null, approx: false, name: 'kokosmjölk' },
    ],
    [
      '2 burkar bönor (à 380 g)',
      { amount: 2, unit: 'burk', grams: 760, approx: false, name: 'bönor' },
    ],
    [
      '3 klyftor vitlök, pressade',
      { amount: 3, unit: 'klyfta', grams: null, approx: false, name: 'vitlök' },
    ],
    ['1½ tsk salt', { amount: 1.5, unit: 'tsk', grams: null, approx: false, name: 'salt' }],
    ['0,5 kg potatis', { amount: 500, unit: 'g', grams: 500, approx: false, name: 'potatis' }],
    ['2-3 morötter', { amount: 2.5, unit: null, grams: null, approx: false, name: 'morötter' }],
    ['500g nötfärs', { amount: 500, unit: 'g', grams: 500, approx: false, name: 'nötfärs' }],
    [
      '1 förp. crème fraiche (ca 200 g)',
      { amount: 1, unit: 'förpackning', grams: 200, approx: true, name: 'crème fraiche' },
    ],
  ])('%s', (text, expected) => {
    expect(parseIngredientText(text)).toEqual(expected);
  });

  it('läser mängder: bråk, blandade tal, ½ och intervall', () => {
    expect(readAmount('1 1/2 dl')?.value).toBe(1.5);
    expect(readAmount('¾ dl')?.value).toBe(0.75);
    expect(readAmount('2,5 dl')?.value).toBe(2.5);
    expect(readAmount('4–6 st')?.value).toBe(5);
    expect(readAmount('dl')).toBeNull();
  });

  it('enhetsord blir appens enheter', () => {
    expect(canonicalUnit('Matskedar')).toBe('msk');
    expect(canonicalUnit('förp.')).toBe('förpackning');
    expect(canonicalUnit('klyftor')).toBe('klyfta');
    expect(canonicalUnit('knippe')).toBe('knippe');
    expect(canonicalUnit('okänd')).toBe('okänd');
  });

  it('AI-tjänstens mängd går före; vikten inom parentes gäller för en burk', () => {
    expect(
      quantityOf({
        original: '1 burk krossade tomater (400 g)',
        amount: 1,
        unit: 'burk',
        name: 'krossade tomater',
      }),
    ).toMatchObject({ amount: 1, unit: 'burk', grams: 400 });
    expect(
      quantityOf({ original: 'ca 500 g kycklingfilé', amount: 0.5, unit: 'kg', name: 'kyckling' }),
    ).toMatchObject({ amount: 500, unit: 'g', grams: 500, approx: true, name: 'kyckling' });
    // Saknar svaret mängd tolkas raden.
    expect(
      quantityOf({ original: '2 dl vetemjöl', amount: null, unit: null, name: 'vetemjöl' }),
    ).toMatchObject({ amount: 2, unit: 'dl', name: 'vetemjöl' });
  });

  it('salt, peppar, vatten och "efter smak" kan hoppas över', () => {
    const skip = (original: string, name = original) => isSkippable({ original, name });
    expect(skip('salt')).toBe(true);
    expect(skip('1 krm salt', 'salt')).toBe(true);
    expect(skip('salt och peppar efter smak', 'salt och peppar')).toBe(true);
    expect(skip('2 dl vatten', 'vatten')).toBe(true);
    expect(skip('färsk basilika till servering', 'basilika')).toBe(true);
    expect(skip('saltgurka')).toBe(false);
    expect(skip('2 dl kokosvatten', 'kokosvatten')).toBe(false);
    expect(skip('2 dl vetemjöl', 'vetemjöl')).toBe(false);
  });
});

describe('mängd i gram med enhetssystemet', () => {
  const flour = food('lv:1', 'Vetemjöl', 341);
  const onion = food('lv:2', 'Lök gul', 33);
  const oil = food('lv:3', 'Olivolja', 884);
  const chicken = food('lv:4', 'Kycklingfilé rå', 110);

  it('volym → gram via densitet', () => {
    const r = resolveAmount(parseIngredientText('2 dl vetemjöl'), flour);
    expect(r).toMatchObject({ amount: 2, unit: 'dl', certain: true });
    expect(r?.grams).toBeGreaterThan(100);
    expect(r?.grams).toBeLessThan(140);
    const oilGrams = resolveAmount(parseIngredientText('1 msk olivolja'), oil)?.grams ?? 0;
    expect(oilGrams).toBeGreaterThan(12);
    expect(oilGrams).toBeLessThan(15);
  });

  it('gram direkt, även ur parentesen', () => {
    expect(resolveAmount(parseIngredientText('ca 500 g kycklingfilé'), chicken)).toEqual({
      amount: 500,
      unit: 'g',
      grams: 500,
      certain: true,
    });
    const tomatoes = food('lv:5', 'Tomater krossade konserv', 21);
    expect(
      resolveAmount(parseIngredientText('1 burk krossade tomater (400 g)'), tomatoes),
    ).toMatchObject({ unit: 'g', grams: 400 });
  });

  it('styck via standardvikt eller gissning (osäker)', () => {
    const r = resolveAmount(parseIngredientText('1/2 gul lök'), onion);
    expect(r?.unit).toBe('st');
    expect(r?.grams).toBeGreaterThan(20);
    // En egen enhet vinner och är säker.
    expect(
      resolveAmount(parseIngredientText('1/2 gul lök'), onion, [
        { name: 'st', grams: 120, source: 'egen' },
      ]),
    ).toEqual({ amount: 0.5, unit: 'st', grams: 60, certain: true });
  });

  it('volym för något utan densitet räknas 1 g/ml men är osäker', () => {
    const mince = food('lv:8', 'Nötfärs', 200);
    expect(resolveAmount(parseIngredientText('2 dl nötfärs'), mince)).toEqual({
      amount: 2,
      unit: 'dl',
      grams: 200,
      certain: false,
    });
  });

  it('ingen mängd eller okänd enhet → null', () => {
    expect(resolveAmount(parseIngredientText('salt'), food('lv:6', 'Salt', 0))).toBeNull();
    expect(resolveAmount(parseIngredientText('1 knippe dill'), food('lv:7', 'Dill', 40))).toBe(
      null,
    );
  });
});

describe('matchning', () => {
  const foods = [
    food('lv:1', 'Vetemjöl', 341),
    food('lv:2', 'Lök gul', 33),
    food('lv:3', 'Olivolja', 884),
    food('lv:4', 'Kyckling bröstfilé rå', 110),
    food('lv:5', 'Tomater krossade konserv', 21),
    food('lv:6', 'Salt', 0),
  ];
  const context = {
    index: buildIndex(foods),
    catalog: buildCatalog(foods),
    memory: {},
    customUnits: new Map(),
  };
  const recipe: ImportedRecipe = {
    name: 'Gryta',
    servings: 4,
    ingredients: [
      { original: '2 dl vetemjöl', amount: 2, unit: 'dl', name: 'vetemjöl' },
      { original: '1/2 gul lök', amount: 0.5, unit: 'st', name: 'gul lök' },
      {
        original: '1 burk krossade tomater (400 g)',
        amount: 1,
        unit: 'burk',
        name: 'krossade tomater',
      },
      { original: 'ca 500 g kycklingfilé', amount: 500, unit: 'g', name: 'kycklingfilé' },
      { original: '1 msk olivolja', amount: 1, unit: 'msk', name: 'olivolja' },
      { original: 'salt', amount: null, unit: null, name: 'salt' },
      { original: '1 tsk sumak', amount: 1, unit: 'tsk', name: 'sumak' },
    ],
  };

  it('säkra träffar, osäkra (fuzzy eller gissad mängd) och ingen träff', () => {
    const rows = buildImportRows(recipe, context);
    const summary = rows.map((r) => [
      r.ingredient.original,
      r.match?.food.name ?? null,
      confidenceOf(r.match, r.resolved),
      r.skippable,
    ]);
    expect(summary).toEqual([
      ['2 dl vetemjöl', 'Vetemjöl', 'hog', false],
      // Styckvikten för lök är en gissning.
      ['1/2 gul lök', 'Lök gul', expect.stringMatching(/hog|osaker/), false],
      ['1 burk krossade tomater (400 g)', 'Tomater krossade konserv', 'hog', false],
      // "kycklingfilé" finns inte som ord – ingen säker träff.
      ['ca 500 g kycklingfilé', null, 'ingen', false],
      ['1 msk olivolja', 'Olivolja', 'hog', false],
      ['salt', 'Salt', 'osaker', true],
      ['1 tsk sumak', null, 'ingen', false],
    ]);
    expect(rows[2]?.resolved?.grams).toBe(400);
  });

  it('minnet av manuella matchningar går före sökningen', () => {
    const memory = rememberMatch({}, ['kycklingfilé'], 'lv:4');
    const rows = buildImportRows(recipe, { ...context, memory });
    const chicken = rows[3];
    expect(chicken?.match).toEqual({ food: foods[3], confidence: 'hog', remembered: true });
    expect(confidenceOf(chicken?.match ?? null, chicken?.resolved ?? null)).toBe('hog');
    expect(chicken?.resolved?.grams).toBe(500);
  });

  it('delar av namnet provas när hela inte ger träff', () => {
    expect(candidateQueries('Krossade tomater, Mutti')).toEqual([
      'krossade tomater mutti',
      'tomater mutti',
      'mutti',
      'krossade tomater',
      'krossade',
    ]);
    const rows = buildImportRows(
      {
        ...recipe,
        ingredients: [
          { original: '1 vetemjöl special', amount: 1, unit: 'dl', name: 'vetemjöl special' },
        ],
      },
      context,
    );
    expect(rows[0]?.match).toMatchObject({ food: foods[0], confidence: 'osaker' });
  });

  it('säker träff kräver att alla ord finns som hela ord', () => {
    expect(isConfidentMatch('gul lök', { name: 'Lök gul' })).toBe(true);
    expect(isConfidentMatch('lök', { name: 'Lök gul rå skalad hackad fryst' })).toBe(false);
    expect(isConfidentMatch('tomat', { name: 'Tomater krossade' })).toBe(false);
  });
});
