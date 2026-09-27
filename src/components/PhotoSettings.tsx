import { PROFILE_SIDES, SIDE_LABELS } from '../lib/photoSessions.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import { ChoiceList } from './ChoiceList.tsx';

/** Inställningar → Bilder: vilken sida profilbilderna tas från. Gäller den här enheten. */
export function PhotoSettings() {
  const { prefs } = usePreferences();
  return (
    <div className="form">
      <ChoiceList
        legend="Profilbilder tas från"
        name="profile-side"
        options={PROFILE_SIDES.map((side) => ({ id: side, label: SIDE_LABELS[side] }))}
        value={prefs.profileSide}
        onChange={(side) => void setPreference('profileSide', side)}
      />
      <p className="muted form-note">
        Ta profilbilderna från samma sida varje gång så blir de lätta att jämföra. Guiden och
        kamerans spökbild följer valet.
      </p>
    </div>
  );
}
