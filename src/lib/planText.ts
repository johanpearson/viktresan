/** Sakliga förklaringar på svenska till kalorimålet, spärrarna och måldatumet. */
import type { AdaptiveTdee } from './adaptiveTdee.ts';
import { MIN_ADAPTIVE_DAYS } from './adaptiveTdee.ts';
import type { CaloriePlan, PlanLimit } from './energy.ts';
import { formatDate, formatInt, formatKcal, formatRate } from './format.ts';

export function limitText(limit: PlanLimit, plan: CaloriePlan): string {
  switch (limit) {
    case 'rate-capped':
      return `Vald takt (${formatRate(plan.chosenRateKg)}) är snabbare än 1 % av din trendvikt per vecka. Kalorimålet bygger därför på högst ${formatRate(plan.maxRateKg)}.`;
    case 'calorie-floor':
      return plan.rateKg > 0
        ? `Kalorimålet har höjts till lägsta rekommenderade intag, ${formatKcal(plan.floorKcal)} per dag. Det motsvarar en takt på omkring ${formatRate(plan.rateKg)}.`
        : `Din beräknade förbrukning ligger under lägsta rekommenderade intag (${formatKcal(plan.floorKcal)} per dag). Kalorimålet är satt till den nivån, vilket ungefär motsvarar att hålla vikten.`;
    case 'goal-reached':
      return 'Trendvikten har nått målvikten. Kalorimålet är satt för att hålla vikten.';
  }
}

/** Förklaring till måldatumet, eller `null` när det inte finns något att säga. */
export function goalDateText(plan: CaloriePlan, goalDate: string | undefined): string | null {
  const check = plan.goalDateCheck;
  if (!goalDate) return null;
  switch (check.kind) {
    case 'none':
      return null;
    case 'passed':
      return `Måldatumet ${formatDate(goalDate)} har passerat. Du kan ange ett nytt i Inställningar.`;
    case 'ok':
      return `Med vald takt når du målvikten före måldatumet ${formatDate(goalDate)}.`;
    case 'needs-faster':
      return `För att nå målvikten till ${formatDate(goalDate)} behövs ${formatRate(check.requiredRateKg)}. Det ryms inom spärrarna, men kalorimålet följer din valda takt.`;
    case 'unrealistic': {
      const base = `Måldatumet ${formatDate(goalDate)} skulle kräva ${formatRate(check.requiredRateKg)}, vilket är snabbare än den högsta rimliga takten (${formatRate(check.maxRateKg)}). Underskottet höjs inte för att hinna.`;
      return check.earliestDate
        ? `${base} Tidigaste rimliga datum är omkring ${formatDate(check.earliestDate)}.`
        : base;
    }
  }
}

/** Varifrån TDEE kommer och hur säker skattningen är. */
export function tdeeSourceText(adaptive: AdaptiveTdee): string {
  if (adaptive.kind === 'formula') {
    return `Förbrukningen är beräknad med formel (Mifflin-St Jeor × aktivitetsnivå). När du loggat vikt och mat i minst ${MIN_ADAPTIVE_DAYS} dagar (minst 80 % av dagarna) skattas den även ur din egen data. Hittills: ${adaptive.bothDays} dagar med båda.`;
  }
  const pct = Math.round(adaptive.weight * 100);
  const clamped = adaptive.clamped
    ? ' Skattningen var orimlig jämfört med formeln – kontrollera att all mat är loggad.'
    : '';
  return `Förbrukningen bygger till ${pct} % på din loggdata (${adaptive.bothDays} dagar, skattat ${formatKcal(adaptive.observedTdee)}) och till ${100 - pct} % på formeln. Säkerhet: ${adaptive.confidence} (±${formatInt(Math.round(adaptive.uncertaintyKcal))} kcal).${clamped}`;
}

export function tdeeSourceLabel(adaptive: AdaptiveTdee): string {
  return adaptive.kind === 'formula'
    ? 'Formel'
    : `Loggdata + formel (${adaptive.confidence} säkerhet)`;
}
