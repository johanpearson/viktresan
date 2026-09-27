import { useState, type SyntheticEvent } from 'react';
import { saveProfile } from '../db/db.ts';
import type { AppData } from '../lib/useAppData.ts';
import { FOOD_PREFERENCES_MAX } from '../lib/validation.ts';

interface FoodPreferencesSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/**
 * Inställningar → Matpreferenser: fritext som "Fråga AI" kan ta med (vad man gillar
 * och ogillar, budget, hur mycket tid man har). Sparas i profilen.
 */
export function FoodPreferencesSettings({ data, onChange }: FoodPreferencesSettingsProps) {
  const { profile } = data;
  const [text, setText] = useState(profile?.foodPreferences ?? '');
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!profile) return;
    const next = { ...profile };
    const trimmed = text.trim();
    if (trimmed === '') delete next.foodPreferences;
    else next.foodPreferences = trimmed;
    await saveProfile(next);
    await onChange();
    setStatus(trimmed === '' ? 'Matpreferenserna är borttagna.' : 'Matpreferenserna är sparade.');
  }

  return (
    <section className="card form" aria-labelledby="food-preferences-title">
      <h2 className="card-title" id="food-preferences-title">
        Matpreferenser
      </h2>
      {!profile ? (
        <p className="form-note">Fyll i profilen först.</p>
      ) : (
        <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <label className="field">
            <span className="field-label">Vad gillar och ogillar du?</span>
            <textarea
              className="input textarea"
              rows={4}
              maxLength={FOOD_PREFERENCES_MAX}
              placeholder="T.ex. gillar fisk och baljväxter, ogillar koriander. Budget ca 80 kr per middag, max 20 minuter på vardagar."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setStatus(null);
              }}
            />
          </label>
          <p className="form-note muted">
            Tas med i &quot;Fråga AI&quot; om du vill – du ser alltid prompten innan den delas.
          </p>
          <button type="submit" className="button">
            Spara matpreferenser
          </button>
          <p className="form-ok" role="status">
            {status}
          </p>
        </form>
      )}
    </section>
  );
}
