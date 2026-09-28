import type { SeedData } from './helpers.ts';

/**
 * Fast testdata för de visuella regressionstesterna. Tiden fryses till torsdag
 * 2026-09-24 kl. 12:30 (Europe/Stockholm) så att "idag", pågående måltid (lunch),
 * veckokortet och milstolparna alltid blir desamma.
 */
export const FROZEN_NOW = '2026-09-24T12:30:00+02:00';
export const TODAY = '2026-09-24';

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
export const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  // Vitaminer och mineraler (åttonde kolumnen) för näringssummeringen.
  extra: ['vitaminD', 'vitaminB12', 'vitaminC', 'calcium', 'iron', 'zinc'],
  foods: [
    [1, 'Havregryn', 370, 13, 59, 7, '', [0, 0, 0, 50, 4, 3]],
    [2, 'Mjölk fett 3 %', 60, 3.5, 4.8, 3, '', [0.5, 0.4, 1, 120, 0, 0.4]],
    [3, 'Banan', 95, 1.1, 21, 0.3, '', [0, 0, 9, 5, 0.3, 0.2]],
    [4, 'Potatis kokt', 80, 2, 17, 0.1, '', [0, 0, 10, 5, 0.4, 0.3]],
    [5, 'Ägg kokt', 136, 12.1, 0, 9.8, '', [2, 1.2, 0, 50, 1.8, 1.2]],
    [6, 'Kycklingfilé stekt', 150, 30, 0, 3, '', [0.2, 0.4, 0, 10, 0.6, 1]],
    [7, 'Kvarg naturell', 63, 11, 3.5, 0.2, '', [0, 0.6, 0, 90, 0, 0.5]],
  ],
};

/** Dagar före TODAY som ISO-datum (ren UTC-aritmetik, samma som appens addDays). */
function daysAgo(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const NOW_MS = Date.parse(FROZEN_NOW);
const DAY = 864e5;
const at = (days: number) => NOW_MS - days * DAY;

/** Deterministiskt "brus" så att viktkurvan ser verklig ut men är likadan varje gång. */
function noise(i: number): number {
  return (((i * 37) % 11) - 5) / 20;
}

const weights = Array.from({ length: 30 }, (_, k) => {
  const days = 58 - k * 2;
  return {
    id: `w${String(k)}`,
    date: daysAgo(days),
    weightKg: Math.round((92 - (58 - days) * 0.09 + noise(k)) * 10) / 10,
    createdAt: at(days),
  };
});

const per100 = (kcal: number, proteinG: number, carbsG: number, fatG: number) => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
});

let n = 0;
function logEntry(
  days: number,
  meal: string,
  foodId: string,
  name: string,
  grams: number,
  values: ReturnType<typeof per100>,
  unit = 'g',
  amount = grams,
) {
  n += 1;
  return {
    id: `f${String(n)}`,
    date: daysAgo(days),
    meal,
    foodId,
    name,
    amount,
    unit,
    grams,
    per100: values,
    createdAt: at(days) + n,
  };
}

const GROT = per100(68, 2.4, 11, 1.3);
const KYCKLING = per100(150, 30, 0, 3);
const POTATIS = per100(80, 2, 17, 0.1);
const KVARG = per100(63, 11, 3.5, 0.2);
const BANAN = per100(95, 1.1, 21, 0.3);
const MJOLK = per100(60, 3.5, 4.8, 3);

/** Idag: frukost + lunch; bakåt en vecka med ungefär samma dagar (för Historik och Veckor). */
const foodLog = [
  logEntry(0, 'frukost', 'egen:grot', 'Havregrynsgröt', 300, GROT),
  logEntry(0, 'frukost', 'lv:2', 'Mjölk fett 3 %', 206, MJOLK, 'dl', 2),
  logEntry(0, 'frukost', 'lv:3', 'Banan', 120, BANAN, 'st', 1),
  logEntry(0, 'lunch', 'lv:6', 'Kycklingfilé stekt', 150, KYCKLING),
  logEntry(0, 'lunch', 'lv:4', 'Potatis kokt', 200, POTATIS),
  ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap((days) => [
    logEntry(days, 'frukost', 'egen:grot', 'Havregrynsgröt', 300, GROT),
    logEntry(days, 'lunch', 'lv:6', 'Kycklingfilé stekt', 150 + (days % 3) * 25, KYCKLING),
    logEntry(days, 'lunch', 'lv:4', 'Potatis kokt', 200, POTATIS),
    logEntry(days, 'middag', 'lv:6', 'Kycklingfilé stekt', 180, KYCKLING),
    logEntry(days, 'mellanmal', 'lv:7', 'Kvarg naturell', 250, KVARG),
  ]),
];

const water = [
  { id: 'v1', date: TODAY, ml: 250, createdAt: at(0) - 5 * 3600e3 },
  { id: 'v2', date: TODAY, ml: 500, createdAt: at(0) - 2 * 3600e3 },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `v-${String(i + 1)}`,
    date: daysAgo(i + 1),
    ml: 1500 + (i % 3) * 250,
    createdAt: at(i + 1),
  })),
];

const steps = Array.from({ length: 14 }, (_, i) => ({
  date: daysAgo(i),
  steps: 6000 + ((i * 1733) % 5000),
  createdAt: at(i),
}));

const waist = [
  { date: daysAgo(28), waistCm: 98, createdAt: at(28) },
  { date: daysAgo(14), waistCm: 96.5, createdAt: at(14) },
  { date: daysAgo(0), waistCm: 95, createdAt: at(0) },
];

/** Promenad mån/ons/fre 07:00 (sedan 12 sep) + ett styrkepass idag 18:00 (planerat). */
const workoutPlans = [
  {
    id: 'plan-promenad',
    type: 'Promenad',
    weekdays: [0, 2, 4],
    time: '07:00',
    durationMin: 30,
    intensity: 'latt',
    startDate: daysAgo(12),
    createdAt: at(12),
  },
];

const workouts = [
  {
    id: 'pass-idag',
    date: TODAY,
    time: '18:00',
    type: 'Styrketräning',
    durationMin: 45,
    intensity: 'medel',
    status: 'planerad',
    createdAt: at(1),
  },
  // Planen ger pass 14, 16, 18, 21 och 23 sep; alla utom det senaste är besvarade.
  ...[3, 6, 8, 10].map((days) => ({
    id: `plan-promenad:${daysAgo(days)}`,
    date: daysAgo(days),
    time: '07:00',
    type: 'Promenad',
    durationMin: 30,
    intensity: 'latt',
    status: 'genomford',
    planId: 'plan-promenad',
    createdAt: at(days),
  })),
];

const medications = [
  {
    id: 'med1',
    name: 'Wegovy',
    frequency: 'vecka',
    weekday: 3,
    time: '08:00',
    steps: [
      { date: daysAgo(49), doseMg: 0.25 },
      { date: daysAgo(21), doseMg: 0.5 },
    ],
    createdAt: at(49),
  },
];

const injections = [7, 14, 21, 28, 35, 42, 49].map((days) => ({
  id: `inj${String(days)}`,
  date: daysAgo(days),
  time: '08:00',
  medicationId: 'med1',
  medicationName: 'Wegovy',
  doseMg: days <= 21 ? 0.5 : 0.25,
  createdAt: at(days),
}));

const D_VITAMIN = [{ key: 'vitaminD', amount: 4000, unit: 'IE' }];

/** Tre tillskott: dagligt (taget idag), torsdagar/måndagar (inte taget) och vid behov. */
const supplements = [
  {
    id: 's-d',
    name: 'D-vitamin forte',
    form: 'tablett',
    amountPerDose: 1,
    nutrients: D_VITAMIN,
    schedule: 'dagligen',
    dosesPerDay: 1,
    ean: '73513537',
    createdAt: at(30),
  },
  {
    id: 's-mg',
    name: 'Magnesium + zink',
    form: 'brustablett',
    amountPerDose: 1,
    nutrients: [
      { key: 'magnesium', amount: 300, unit: 'mg' },
      { key: 'zinc', amount: 5, unit: 'mg' },
    ],
    schedule: 'veckodagar',
    weekdays: [0, 3],
    dosesPerDay: 1,
    createdAt: at(30),
  },
  {
    id: 's-fe',
    name: 'Järn',
    form: 'tablett',
    amountPerDose: 1,
    nutrients: [{ key: 'iron', amount: 20, unit: 'mg' }],
    schedule: 'vid-behov',
    dosesPerDay: 1,
    createdAt: at(30),
  },
];

const supplementLog = Array.from({ length: 7 }, (_, days) => ({
  id: `s-d:${daysAgo(days)}`,
  date: daysAgo(days),
  supplementId: 's-d',
  name: 'D-vitamin forte',
  doses: 1,
  nutrients: D_VITAMIN,
  createdAt: at(days),
}));

/** Veckoläge med en snabblogg till lunch idag (egna tester, ändrar inte övriga vyer). */
export const WEEKLY_EXTRA: SeedData = {
  foodLog: [
    {
      id: 'snabb-idag',
      date: TODAY,
      meal: 'lunch',
      foodId: 'snabb:jobblunch:700:35',
      name: 'Jobblunch',
      amount: 1,
      unit: 'portion',
      grams: 100,
      per100: per100(700, 35, 0, 0),
      estimated: true,
      createdAt: at(0) + 1000,
    },
  ],
};

export const VISUAL_DATA: SeedData = {
  profile: {
    startDate: daysAgo(60),
    startWeightKg: 92,
    heightCm: 178,
    goalWeightKg: 80,
    goalDate: '2027-03-01',
    sex: 'kvinna',
    birthYear: 1985,
    activityLevel: 'latt',
    ratePerWeekKg: 0.5,
  },
  weights,
  waist,
  steps,
  foods: [
    {
      id: 'egen:grot',
      name: 'Havregrynsgröt',
      source: 'egen',
      per100: GROT,
      createdAt: at(60),
    },
    {
      id: 'egen:bar',
      name: 'Proteinbar choklad',
      source: 'egen',
      per100: per100(360, 33, 30, 12),
      createdAt: at(30),
    },
  ],
  meals: [
    {
      id: 'kycklinglunch',
      name: 'Kycklinglunch',
      items: [
        {
          foodId: 'lv:6',
          name: 'Kycklingfilé stekt',
          amount: 150,
          unit: 'g',
          grams: 150,
          per100: KYCKLING,
        },
        {
          foodId: 'lv:4',
          name: 'Potatis kokt',
          amount: 200,
          unit: 'g',
          grams: 200,
          per100: POTATIS,
        },
      ],
      createdAt: at(40),
    },
  ],
  recipes: [
    {
      id: 'linsgryta',
      name: 'Linsgryta med potatis',
      items: [
        {
          foodId: 'lv:4',
          name: 'Potatis kokt',
          amount: 800,
          unit: 'g',
          grams: 800,
          per100: POTATIS,
        },
        {
          foodId: 'lv:5',
          name: 'Ägg kokt',
          amount: 6,
          unit: 'st',
          grams: 360,
          per100: per100(136, 12.1, 0, 9.8),
        },
      ],
      servings: 4,
      cookedWeightG: 1200,
      createdAt: at(10),
    },
  ],
  favorites: [{ foodId: 'lv:6', createdAt: at(20) }],
  foodLog,
  water,
  workouts,
  workoutPlans,
  medications,
  injections,
  symptoms: [{ date: daysAgo(1), appetite: 2, sideEffects: ['Illamående'], createdAt: at(1) }],
  supplements,
  supplementLog,
  settings: {
    // Alla funktioner på (GLP-1 är annars av som standard).
    features: {
      steg: true,
      midja: true,
      mat: true,
      vatten: true,
      traning: true,
      glp1: true,
      tillskott: true,
      bilder: true,
      version: 4,
    },
    lastExportAt: at(2),
  },
};
