import { useState } from 'react';
import { getProfile, saveProfile } from '../db/db.ts';

/**
 * Val efter "Mål nått": sätt ett nytt mål (profilen i Inställningar) eller byt till
 * viktstabilisering – takt 0, så att kalorimålet blir förbrukningen (TDEE).
 */
export function GoalReachedActions() {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  async function stabilize() {
    setState('saving');
    try {
      const profile = await getProfile();
      if (!profile) throw new Error('Ingen profil');
      await saveProfile({ ...profile, ratePerWeekKg: 0 });
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="celebration-actions">
      <p className="celebration-question">Vad vill du göra nu?</p>
      <div className="button-row">
        <a className="button" href="#/installningar">
          Sätt ett nytt mål
        </a>
        <button
          type="button"
          className="button button-secondary"
          data-keep-open
          disabled={state === 'saving' || state === 'done'}
          onClick={() => void stabilize()}
        >
          Håll vikten
        </button>
      </div>
      <p className="form-ok" role="status">
        {state === 'done'
          ? 'Klart! Kalorimålet motsvarar nu din förbrukning, så att du håller vikten.'
          : state === 'error'
            ? 'Det gick inte att spara. Du kan ändra takten under Inställningar.'
            : ''}
      </p>
    </div>
  );
}
