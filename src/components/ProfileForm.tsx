import { useState, type SyntheticEvent } from 'react';
import { saveProfile, type Profile } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
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
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseProfile({ startDate, startWeight, height, goalWeight, goalDate });
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }
    await saveProfile(result.value);
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
