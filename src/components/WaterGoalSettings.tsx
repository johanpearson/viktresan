import { useState, type SyntheticEvent } from 'react';
import { saveProfile } from '../db/db.ts';
import { formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWaterGoal } from '../lib/validation.ts';
import { useFeatures } from '../lib/features.ts';
import {
  defaultWaterGoalMl,
  DRINK_GOAL_ML,
  GLP1_WATER_BONUS_DEFAULT_ML,
  GLP1_WATER_BONUS_OPTIONS,
  GLP1_WATER_REASON,
  TRAINING_BONUS_ML,
  waterGoal,
} from '../lib/water.ts';
import { Feature } from './Feature.tsx';

interface WaterGoalSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/**
 * Inställningar → Dryckesmål: standardmål efter kön (EFSA), valfritt eget mål,
 * valfritt tillägg på träningsdagar och (med GLP-1) ett justerbart GLP-1-tillägg.
 */
export function WaterGoalSettings({ data, onChange }: WaterGoalSettingsProps) {
  const { profile } = data;
  const [value, setValue] = useState(profile?.waterGoalMl ? String(profile.waterGoalMl) : '');
  const [bonus, setBonus] = useState(profile?.waterTrainingBonus === true);
  const glp1 = useFeatures().isEnabled('glp1');
  const [glp1Bonus, setGlp1Bonus] = useState(
    profile?.waterGlp1BonusMl ?? GLP1_WATER_BONUS_DEFAULT_ML,
  );
  const [glp1OnOwn, setGlp1OnOwn] = useState(profile?.waterGlp1OnOwnGoal === true);
  const hasOwnGoal = value.trim() !== '';
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sex = profile?.sex;
  const standardMl = defaultWaterGoalMl(sex);

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
    if (bonus) next.waterTrainingBonus = true;
    else delete next.waterTrainingBonus;
    if (glp1) {
      if (glp1Bonus === GLP1_WATER_BONUS_DEFAULT_ML) delete next.waterGlp1BonusMl;
      else next.waterGlp1BonusMl = glp1Bonus;
      if (glp1OnOwn) next.waterGlp1OnOwnGoal = true;
      else delete next.waterGlp1OnOwnGoal;
    }
    await saveProfile(next);
    await onChange();
    setError(null);
    const goal = waterGoal({ profile: next, glp1 });
    const withGlp1 = goal.glp1BonusMl > 0 ? ` (varav ${formatMl(goal.glp1BonusMl)} för GLP-1)` : '';
    setStatus(
      goal.source === 'standard'
        ? `Dryckesmålet är standardmålet, ${formatMl(goal.ml)} per dag${withGlp1}.`
        : `Dryckesmålet är ${formatMl(goal.ml)} per dag${withGlp1}.`,
    );
  }

  return (
    <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {!profile ? (
        <p className="form-note">Fyll i profilen först – målet sparas i profilen.</p>
      ) : (
        <>
          <p className="form-note" data-testid="water-goal-standard">
            {sex === 'man'
              ? `Standard för män: ${formatMl(standardMl)} per dag.`
              : sex === 'kvinna'
                ? `Standard för kvinnor: ${formatMl(standardMl)} per dag.`
                : `Standard: ${formatMl(standardMl)} per dag. Ange kön i profilen för ${formatMl(DRINK_GOAL_ML.man)} (män) eller ${formatMl(DRINK_GOAL_ML.kvinna)} (kvinnor).`}
          </p>
          <p className="form-note">
            Värdet kommer från EFSA:s referensvärden för vätskeintag – 2,5 liter per dag för män och
            2,0 liter för kvinnor – där ungefär 80 % kommer från dryck och resten från maten. Det
            beror inte på kroppsvikten. Drycker du loggar i Mat (mjölk, fil, juice, kaffe … men inte
            alkohol) räknas in automatiskt.
          </p>
          <label className="field">
            <span className="field-label">Eget mål (ml, valfritt)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder={String(standardMl)}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </label>
          <Feature id="traning">
            <label className="switch-row">
              <span className="switch-text">
                <span className="switch-label">
                  +{formatMl(TRAINING_BONUS_ML)} på träningsdagar
                </span>
                <span className="switch-description" id="water-bonus-desc">
                  Höjer dagens mål när ett pass är markerat som genomfört.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={bonus}
                aria-describedby="water-bonus-desc"
                data-testid="water-training-bonus"
                onChange={(e) => {
                  setBonus(e.target.checked);
                }}
              />
            </label>
          </Feature>
          <Feature id="glp1">
            <label className="field">
              <span className="field-label">Tillägg med GLP-1</span>
              <select
                className="input"
                value={String(glp1Bonus)}
                aria-describedby="water-glp1-desc"
                data-testid="water-glp1-bonus"
                onChange={(e) => {
                  setGlp1Bonus(Number(e.target.value));
                }}
              >
                {GLP1_WATER_BONUS_OPTIONS.map((ml) => (
                  <option key={ml} value={String(ml)}>
                    {ml === 0 ? 'Inget tillägg' : `+${formatMl(ml)}`}
                    {ml === GLP1_WATER_BONUS_DEFAULT_ML ? ' (standard)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-note muted" id="water-glp1-desc">
              {GLP1_WATER_REASON} Läggs på standardmålet varje dag medan GLP-1 är på.
            </p>
            {hasOwnGoal && (
              <label className="switch-row">
                <span className="switch-text">
                  <span className="switch-label">Lägg GLP-1-tillägget på mitt eget mål</span>
                  <span className="switch-description" id="water-glp1-own-desc">
                    Av: ditt eget mål gäller som det är.
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={glp1OnOwn}
                  aria-describedby="water-glp1-own-desc"
                  data-testid="water-glp1-own"
                  onChange={(e) => {
                    setGlp1OnOwn(e.target.checked);
                  }}
                />
              </label>
            )}
          </Feature>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button">
            Spara dryckesmål
          </button>
          <p className="form-ok" role="status">
            {status}
          </p>
        </>
      )}
    </form>
  );
}
