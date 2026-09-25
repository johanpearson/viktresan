import { useState, type SyntheticEvent } from 'react';
import { saveProfile } from '../db/db.ts';
import { formatKg, formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWaterGoal } from '../lib/validation.ts';
import { waterGoal, WATER_ML_PER_KG } from '../lib/water.ts';

interface WaterGoalSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Inställningar → Vatten: eget dagsmål, annars 33 ml × trendvikten. */
export function WaterGoalSettings({ data, onChange }: WaterGoalSettingsProps) {
  const { profile } = data;
  const [value, setValue] = useState(profile?.waterGoalMl ? String(profile.waterGoalMl) : '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const standard = waterGoal({
    weights: data.weights,
    profile: profile ? { startWeightKg: profile.startWeightKg } : null,
  });

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (!profile) return;
    const parsed = parseWaterGoal(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const next = { ...profile };
    if (parsed.value == null) delete next.waterGoalMl;
    else next.waterGoalMl = parsed.value;
    await saveProfile(next);
    await onChange();
    setError(null);
    setStatus(
      parsed.value == null
        ? 'Vattenmålet följer din trendvikt.'
        : `Vattenmålet är ${formatMl(parsed.value)} per dag.`,
    );
  }

  return (
    <form
      className="card form"
      aria-labelledby="water-goal-title"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
    >
      <h2 className="card-title" id="water-goal-title">
        Vattenmål
      </h2>
      {!profile || !standard ? (
        <p className="form-note">Fyll i profilen först – målet räknas från din vikt.</p>
      ) : (
        <>
          <p className="form-note" data-testid="water-goal-standard">
            Standard: {WATER_ML_PER_KG} ml × {formatKg(standard.basisKg ?? 0)}
            {standard.source === 'trend' ? ' (trendvikt)' : ' (startvikt)'} ≈{' '}
            {formatMl(standard.ml)} per dag.
          </p>
          <label className="field">
            <span className="field-label">Eget mål (ml, valfritt)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder={String(standard.ml)}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button">
            Spara vattenmål
          </button>
          <p className="form-ok" role="status">
            {status}
          </p>
        </>
      )}
    </form>
  );
}
