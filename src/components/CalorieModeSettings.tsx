import { useState } from 'react';
import { saveProfile, type CalorieMode } from '../db/db.ts';
import { formatInt } from '../lib/format.ts';
import { buildPlan } from '../lib/plan.ts';
import { todayIso } from '../lib/dates.ts';
import type { AppData } from '../lib/useAppData.ts';
import { ChoiceList, type ChoiceOption } from './ChoiceList.tsx';

interface CalorieModeSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

const OPTIONS: readonly ChoiceOption<CalorieMode>[] = [
  { id: 'dag', label: 'Per dag', description: 'Samma kalorimål varje dag (standard).' },
  {
    id: 'vecka',
    label: 'Per vecka',
    description:
      'En budget för måndag–söndag. Äter du mer en dag blir förslaget lägre resten av veckan – men aldrig under kalorigolvet.',
  },
];

/** Inställningar → Kalorimål: mål per dag (standard) eller veckobudget. Sparas i profilen. */
export function CalorieModeSettings({ data, onChange }: CalorieModeSettingsProps) {
  const { profile } = data;
  const [status, setStatus] = useState<string | null>(null);
  const mode = profile?.calorieMode ?? 'dag';
  const plan = profile ? buildPlan(profile, data.weights, data.foodLog, todayIso()) : null;
  const daily = plan?.kind === 'plan' ? Math.round(plan.plan.targetKcal) : null;

  async function handleChange(value: CalorieMode) {
    if (!profile) return;
    const next = { ...profile };
    if (value === 'dag') delete next.calorieMode;
    else next.calorieMode = value;
    await saveProfile(next);
    await onChange();
    setStatus(
      value === 'vecka'
        ? 'Kalorimålet räknas nu per vecka. Dagens förslag visas under Mat och på Översikt.'
        : 'Kalorimålet räknas nu per dag.',
    );
  }

  if (!profile) {
    return (
      <div className="form">
        <p className="form-note">Fyll i profilen först – målet räknas från den.</p>
      </div>
    );
  }

  return (
    <div className="form">
      <ChoiceList
        legend="Räkna kalorimålet"
        name="calorie-mode"
        testId="calorie-mode"
        options={OPTIONS}
        value={mode}
        onChange={(value) => void handleChange(value)}
      />
      {daily !== null && (
        <p className="form-note muted" data-testid="week-budget-explained">
          Veckobudget = 7 × dagsmålet ({formatInt(daily)} kcal) = {formatInt(daily * 7)} kcal.
          Dagens förslag = det som är kvar av budgeten delat på dagarna som är kvar. Dagar utan
          matlogg räknas som dagsmålet.
        </p>
      )}
      <p className="form-ok" role="status">
        {status}
      </p>
    </div>
  );
}
