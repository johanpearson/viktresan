import { PROFILE_SIDES, SIDE_LABELS } from '../lib/photoSessions.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';

/** Inställningar → Bilder: vilken sida profilbilderna tas från. Gäller den här enheten. */
export function PhotoSettings() {
  const { prefs } = usePreferences();
  return (
    <section className="card" aria-labelledby="photo-settings-title">
      <h2 className="card-title" id="photo-settings-title">
        Bilder
      </h2>
      <fieldset className="choice-group">
        <legend className="field-label">Profilbilder tas från</legend>
        {PROFILE_SIDES.map((side) => (
          <label key={side} className="choice">
            <input
              type="radio"
              name="profile-side"
              value={side}
              checked={prefs.profileSide === side}
              onChange={() => void setPreference('profileSide', side)}
            />
            <span className="choice-label">{SIDE_LABELS[side]}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted form-note">
        Ta profilbilderna från samma sida varje gång så blir de lätta att jämföra. Guiden och
        kamerans spökbild följer valet.
      </p>
    </section>
  );
}
