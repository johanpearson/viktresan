import { useState, type SyntheticEvent } from 'react';
import { saveProfile, type Profile } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import {
  ACTIVITY_LEVELS,
  DEFAULT_RATE_KG,
  RATE_OPTIONS,
  type ActivityLevel,
  type Sex,
} from '../lib/energy.ts';
import { parseProfile } from '../lib/validation.ts';

interface ProfileFormProps {
  profile: Profile | null;
  onSaved: () => void;
}

function numberText(value: number | undefined): string {
  return value == null ? '' : String(value).replace('.', ',');
}

export function ProfileForm({ profile, onSaved }: ProfileFormProps) {
  const [startDate, setStartDate] = useState(profile?.startDate ?? todayIso());
  const [startWeight, setStartWeight] = useState(numberText(profile?.startWeightKg));
  const [height, setHeight] = useState(numberText(profile?.heightCm));
  const [goalWeight, setGoalWeight] = useState(numberText(profile?.goalWeightKg));
  const [goalDate, setGoalDate] = useState(profile?.goalDate ?? '');
  const [sex, setSex] = useState<'' | Sex>(profile?.sex ?? '');
  const [birthYear, setBirthYear] = useState(profile?.birthYear?.toString() ?? '');
  const [activityLevel, setActivityLevel] = useState<'' | ActivityLevel>(
    profile?.activityLevel ?? '',
  );
  const [rate, setRate] = useState(String(profile?.ratePerWeekKg ?? DEFAULT_RATE_KG));
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseProfile({
      startDate,
      startWeight,
      height,
      goalWeight,
      goalDate,
      sex,
      birthYear,
      activityLevel,
      rate,
    });
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }
    // Vattenmålet sparas under Inställningar → Vattenmål och ska inte försvinna här.
    await saveProfile(
      profile?.waterGoalMl != null
        ? { ...result.value, waterGoalMl: profile.waterGoalMl }
        : result.value,
    );
    setMessage({ kind: 'ok', text: 'Profilen är sparad.' });
    onSaved();
  }

  return (
    <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label className="field">
        <span className="field-label">Startdatum</span>
        <input
          className="input"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
          }}
          required
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Startvikt (kg)</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={startWeight}
            onChange={(e) => {
              setStartWeight(e.target.value);
            }}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Längd (cm)</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={height}
            onChange={(e) => {
              setHeight(e.target.value);
            }}
            required
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Målvikt (kg)</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={goalWeight}
            onChange={(e) => {
              setGoalWeight(e.target.value);
            }}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Måldatum (valfritt)</span>
          <input
            className="input"
            type="date"
            value={goalDate}
            onChange={(e) => {
              setGoalDate(e.target.value);
            }}
          />
        </label>
      </div>
      <fieldset className="fieldset">
        <legend className="field-label">Kalorimål</legend>
        <p className="form-note muted">
          Kön, födelseår och aktivitetsnivå används bara för att räkna ut ditt energibehov.
        </p>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Kön</span>
            <select
              className="input"
              value={sex}
              onChange={(e) => {
                const v = e.target.value;
                setSex(v === 'man' || v === 'kvinna' ? v : '');
              }}
            >
              <option value="">Välj</option>
              <option value="kvinna">Kvinna</option>
              <option value="man">Man</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Födelseår</span>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              value={birthYear}
              onChange={(e) => {
                setBirthYear(e.target.value);
              }}
            />
          </label>
        </div>
        <fieldset className="choice-group">
          <legend className="field-label">Aktivitetsnivå</legend>
          {ACTIVITY_LEVELS.map((level) => (
            <label key={level.id} className="choice">
              <input
                type="radio"
                name="activity"
                value={level.id}
                checked={activityLevel === level.id}
                onChange={() => {
                  setActivityLevel(level.id);
                }}
              />
              <span>
                <span className="choice-label">{level.label}</span>
                <span className="choice-description">{level.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="field-label">Önskad takt</span>
          <select
            className="input"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
            }}
          >
            {RATE_OPTIONS.map((r) => (
              <option key={r} value={String(r)}>
                {String(r).replace('.', ',')} kg per vecka
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {message && (
        <p className={message.kind === 'error' ? 'form-error' : 'form-ok'} role="status">
          {message.text}
        </p>
      )}
      <button type="submit" className="button">
        Spara profil
      </button>
    </form>
  );
}
