import { describe, expect, it } from 'vitest';
import type { FoodLogEntry, Medication, Profile } from '../db/db.ts';
import { formatDayMonth } from './format.ts';
import { defaultMealSlots } from './mealSlots.ts';
import {
  AI_OPTIONS,
  DEFAULT_AI_OPTIONS,
  MAX_URL_LENGTH,
  aiContextFrom,
  aiServiceUrl,
  buildAiPrompt,
  daySubject,
  mealSubject,
  parseAiOptions,
  weekSubject,
  type AiContext,
  type AiOption,
} from './aiPrompt.ts';

const TODAY = '2026-09-26';

function entry(
  id: string,
  meal: FoodLogEntry['meal'],
  name: string,
  grams: number,
  date = TODAY,
): FoodLogEntry {
  return {
    id,
    date,
    meal,
    foodId: `egen:${id}`,
    name,
    amount: grams,
    unit: 'g',
    grams,
    per100: { kcal: 100, proteinG: 10, carbsG: 10, fatG: 2 },
    createdAt: Number(id.replace(/\D/g, '') || 1),
  };
}

const PROFILE: Profile = {
  startDate: '2026-08-01',
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
  foodPreferences: 'Gillar fisk, ogillar koriander. Max 20 min på vardagar.',
};

const MED: Medication = {
  id: 'med',
  name: 'Wegovy',
  frequency: 'vecka',
  weekday: 0,
  time: '08:00',
  steps: [{ date: '2026-08-03', doseMg: 1 }],
  createdAt: 1,
};

const log = [
  entry('e1', 'frukost', 'Havregryn', 60),
  entry('e2', 'frukost', 'Mjölk', 200),
  entry('e3', 'lunch', 'Kycklinggryta', 400),
];

function context(): AiContext {
  return aiContextFrom(
    {
      profile: PROFILE,
      weights: [{ id: 'w', date: TODAY, weightKg: 88, createdAt: 1 }],
      foodLog: log,
      medications: [MED],
      injections: [],
      symptoms: [{ date: '2026-09-25', appetite: 2, sideEffects: ['Illamående'], createdAt: 1 }],
    },
    TODAY,
  );
}

const breakfast = mealSubject(
  log.filter((e) => e.meal === 'frukost'),
  'Frukost',
  TODAY,
);

function withOnly(off: AiOption) {
  return { ...DEFAULT_AI_OPTIONS, glp1: true, [off]: false };
}

describe('buildAiPrompt', () => {
  it('bygger en svensk prompt med mål, innehåll och instruktioner', () => {
    const prompt = buildAiPrompt(breakfast, context(), DEFAULT_AI_OPTIONS);
    expect(prompt).toContain('förbättra min frukost 26 sep');
    expect(prompt).toContain('Om mig: 40 år, man, 180 cm, trendvikt 88');
    expect(prompt).toContain('Mål: 80,0 kg, takt 0,5 kg/vecka.');
    expect(prompt).toMatch(/Dagsmål: [\d ]+ kcal och 128 g protein\./);
    expect(prompt).toContain('Dagens intag hittills (inklusive måltiden): 660 kcal, 66 g protein.');
    expect(prompt).toContain('Frukost (totalt 260 kcal, 26 g protein):');
    expect(prompt).toContain('- Havregryn, 60 g (60 kcal, 6 g protein)');
    expect(prompt).toContain('Mina matpreferenser: Gillar fisk, ogillar koriander.');
    expect(prompt).toContain('2–3 konkreta, förbättrade varianter');
    expect(prompt).toContain('under 1 500 kcal');
    expect(prompt).toContain('Svara kort och på svenska');
    expect(prompt).not.toContain('{{');
  });

  it('utesluter GLP-1 som standard', () => {
    expect(DEFAULT_AI_OPTIONS.glp1).toBe(false);
    const prompt = buildAiPrompt(breakfast, context(), DEFAULT_AI_OPTIONS);
    expect(prompt).not.toContain('GLP-1');
    expect(prompt).not.toContain('Wegovy');
  });

  it('tar med GLP-1 när rutan kryssas i', () => {
    const prompt = buildAiPrompt(breakfast, context(), { ...DEFAULT_AI_OPTIONS, glp1: true });
    expect(prompt).toContain(
      'Jag behandlas med GLP-1: Wegovy 1 mg per vecka sedan 3 aug; senast (25 sep): aptit 2 av 5, Illamående.',
    );
  });

  const cases: [AiOption, string[]][] = [
    ['personal', ['40 år', ', man,']],
    ['body', ['180 cm', 'trendvikt']],
    ['goal', ['Mål: 80,0 kg', 'takt 0,5']],
    ['targets', ['Dagsmål:']],
    ['dayIntake', ['Dagens intag hittills']],
    ['content', ['Havregryn', 'Frukost (totalt']],
    ['preferences', ['koriander']],
    ['glp1', ['Wegovy']],
  ];

  it.each(cases)('kryssrutan %s styr innehållet', (option, texts) => {
    const all = buildAiPrompt(breakfast, context(), { ...DEFAULT_AI_OPTIONS, glp1: true });
    const without = buildAiPrompt(breakfast, context(), withOnly(option));
    for (const text of texts) {
      expect(all).toContain(text);
      expect(without).not.toContain(text);
    }
  });

  it('alla kryssrutor har ett testfall', () => {
    expect(AI_OPTIONS.map((o) => o.id).sort()).toEqual(cases.map(([id]) => id).sort());
  });

  it('kalorigolvet är det lägsta när könet inte delas', () => {
    const prompt = buildAiPrompt(breakfast, context(), withOnly('personal'));
    expect(prompt).toContain('under 1 200 kcal');
  });

  it('säger att inget delas när allt är avkryssat', () => {
    const none = Object.fromEntries(AI_OPTIONS.map((o) => [o.id, false])) as Record<
      AiOption,
      boolean
    >;
    const prompt = buildAiPrompt(breakfast, context(), none);
    expect(prompt).toContain('Jag har valt att inte dela några uppgifter om mig själv.');
    expect(prompt).not.toContain('Havregryn');
  });

  it('hela dagen listar maten per måltid och tar inte med "hittills"', () => {
    const prompt = buildAiPrompt(
      daySubject(log, TODAY, defaultMealSlots()),
      context(),
      DEFAULT_AI_OPTIONS,
    );
    expect(prompt).toContain('förbättra min mat 26 sep');
    expect(prompt).toContain('Dagens mat (totalt 660 kcal, 66 g protein):');
    expect(prompt).toContain('- Lunch: Kycklinggryta, 400 g');
    expect(prompt).not.toContain('hittills');
    expect(prompt).toContain('Bedöm kort dagen');
  });

  it('veckan visar intag per dag och det som gav mest energi', () => {
    const week = [
      ...log,
      entry('e4', 'middag', 'Pizza', 300, '2026-09-22'),
      entry('e5', 'middag', 'Kycklinggryta', 100, '2026-09-22'),
    ];
    const prompt = buildAiPrompt(
      weekSubject(week, '2026-09-21', '2026-09-27'),
      context(),
      DEFAULT_AI_OPTIONS,
    );
    expect(prompt).toContain('min mat veckan 21 sep–27 sep');
    expect(prompt).toContain(
      'Veckans mat (2 loggade dagar), snitt 530 kcal, 53 g protein per dag:',
    );
    expect(prompt).toContain('- 22 sep: 400 kcal, 40 g protein');
    expect(prompt).toContain('- Kycklinggryta: 500 kcal');
  });

  it('mallen går att byta', () => {
    expect(
      buildAiPrompt(breakfast, context(), DEFAULT_AI_OPTIONS, 'Om {{amneKort}}: {{okänd}}'),
    ).toBe('Om måltiden: {{okänd}}');
  });
});

describe('buildAiPrompt – platå', () => {
  const plateau = { kind: 'plateau' as const, lines: ['Trendvikten har ändrats +0,1 kg.'] };

  it('använder platåmallen med analysen som underlag, utan matpreferenser', () => {
    const prompt = buildAiPrompt(plateau, context(), DEFAULT_AI_OPTIONS);
    expect(prompt).toContain('förstå min viktplatå');
    expect(prompt).toContain('Trendvikten har ändrats +0,1 kg.');
    expect(prompt).toContain('inga ändringar av läkemedelsdoser');
    expect(prompt).not.toContain('Mina matpreferenser');
  });

  it('platåanalysen kan väljas bort', () => {
    const prompt = buildAiPrompt(plateau, context(), { ...DEFAULT_AI_OPTIONS, content: false });
    expect(prompt).not.toContain('Trendvikten har ändrats');
  });
});

describe('buildAiPrompt – Vad ska jag äta?', () => {
  const eat = {
    kind: 'eat' as const,
    meal: 'Kvällsmål',
    remaining: { kcal: 640.4, proteinG: 45.2, fiberG: -2 },
    typicalKcal: 250,
    homeFoods: ['Kvarg naturell', 'Banan', 'Knäckebröd'],
  };

  it('tar med måltid, kvarvarande värden, typisk portion, det som brukar finnas hemma och matpreferenser', () => {
    const prompt = buildAiPrompt(eat, context(), DEFAULT_AI_OPTIONS);
    expect(prompt).toContain('vad jag ska äta till kvällsmål idag');
    expect(prompt).toContain('Måltid: Kvällsmål, min typiska portion är ca 250 kcal.');
    expect(prompt).toContain('Kvar av dagens mål: 640 kcal, 45 g protein, 0 g fiber.');
    expect(prompt).toContain('Det här brukar finnas hemma: Kvarg naturell, Banan, Knäckebröd.');
    expect(prompt).toContain('Mina matpreferenser: Gillar fisk');
    expect(prompt).toContain('3 realistiska förslag som passar måltiden');
    expect(prompt).toContain('ungefärliga mängder och ungefärliga näringsvärden');
    expect(prompt).toContain('på svenska');
    expect(prompt).toContain('under 1 500 kcal');
  });

  it('utan historik för måltiden nämns ingen typisk portion', () => {
    const prompt = buildAiPrompt({ ...eat, typicalKcal: null }, context(), DEFAULT_AI_OPTIONS);
    expect(prompt).toContain('Måltid: Kvällsmål.');
    expect(prompt).not.toContain('typiska portion är');
  });

  it('kryssrutorna styr: underlaget och matpreferenserna kan väljas bort', () => {
    const prompt = buildAiPrompt(eat, context(), {
      ...DEFAULT_AI_OPTIONS,
      content: false,
      preferences: false,
    });
    expect(prompt).not.toContain('brukar finnas hemma:');
    expect(prompt).not.toContain('Kvar av dagens mål');
    expect(prompt).not.toContain('Mina matpreferenser');
  });
});

describe('aiContextFrom', () => {
  it('utan profil är allt okänt', () => {
    const ctx = aiContextFrom(
      { profile: null, weights: [], foodLog: [], medications: [], injections: [], symptoms: [] },
      TODAY,
    );
    expect(ctx.targetKcal).toBeNull();
    expect(ctx.age).toBeNull();
    expect(ctx.glp1).toBeNull();
    expect(ctx.dayIntake).toBeNull();
  });

  it('tomma matpreferenser räknas som inga', () => {
    const ctx = aiContextFrom(
      {
        profile: { ...PROFILE, foodPreferences: '  ' },
        weights: [],
        foodLog: [],
        medications: [],
        injections: [],
        symptoms: [],
      },
      TODAY,
    );
    expect(ctx.foodPreferences).toBeNull();
  });
});

describe('parseAiOptions', () => {
  it('okända och felaktiga värden får standardvärdet', () => {
    expect(parseAiOptions(null)).toEqual(DEFAULT_AI_OPTIONS);
    expect(parseAiOptions({ glp1: true, content: 'ja', annat: false })).toEqual({
      ...DEFAULT_AI_OPTIONS,
      glp1: true,
    });
  });
});

describe('aiServiceUrl', () => {
  it('förifyller prompten i adressen', () => {
    expect(aiServiceUrl('chatgpt', 'Hej på dig')).toBe(
      'https://chatgpt.com/?q=Hej%20p%C3%A5%20dig',
    );
    expect(aiServiceUrl('claude', 'Hej')).toBe('https://claude.ai/new?q=Hej');
  });

  it('null när prompten inte får plats', () => {
    expect(aiServiceUrl('claude', 'x'.repeat(MAX_URL_LENGTH))).toBeNull();
  });
});

describe('formatDayMonth', () => {
  it('skriver dag och kort månad', () => {
    expect(formatDayMonth('2026-09-26')).toBe('26 sep');
    expect(formatDayMonth('2026-01-05')).toBe('5 jan');
  });
});
