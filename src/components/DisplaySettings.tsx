import { CLAIM_RULES, CLAIM_SOURCE, type ClaimId } from '../data/nutritionClaims.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import { Feature } from './Feature.tsx';

/** Inställningar → Visning. Gäller den här enheten. */
export function DisplaySettings() {
  const { prefs } = usePreferences();
  function toggleClaim(id: ClaimId, shown: boolean) {
    const hidden = prefs.claimsHidden.filter((c) => c !== id);
    void setPreference('claimsHidden', shown ? hidden : [...hidden, id]);
  }
  return (
    <>
      <ul className="switch-list">
        <li>
          <label className="switch-row">
            <span className="switch-text">
              <span className="switch-label">Visa trendvikt som huvudsiffra</span>
              <span className="switch-description" id="pref-trend-hero-desc">
                Översikt visar trendvikten stort och dagsvikten litet under. Dagsvikten varierar med
                vätska och salt; trenden visar riktningen.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={prefs.trendHero}
              aria-describedby="pref-trend-hero-desc"
              data-testid="pref-trend-hero"
              onChange={(e) => void setPreference('trendHero', e.target.checked)}
            />
          </label>
        </li>
        <li>
          <label className="switch-row">
            <span className="switch-text">
              <span className="switch-label">Vibration vid spara</span>
              <span className="switch-description" id="pref-haptics-desc">
                En kort vibration när du sparar eller markerar något som klart (om telefonen stöder
                det). Stängs alltid av med systemets inställning för minskad rörelse.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={prefs.haptics}
              aria-describedby="pref-haptics-desc"
              data-testid="pref-haptics"
              onChange={(e) => void setPreference('haptics', e.target.checked)}
            />
          </label>
        </li>
      </ul>
      <Feature id="mat">
        <h3 className="subheading" id="claims-heading">
          Näringsetiketter
        </h3>
        <p className="form-note muted">
          Visas i sökträffar, Senaste, Favoriter, livsmedlets detaljer och egna måltider och recept.
          Villkoren följer EU:s näringspåståenden ({CLAIM_SOURCE}); utan underlag (t.ex. fiberdata)
          visas ingen etikett.
        </p>
        <ul className="switch-list" aria-labelledby="claims-heading">
          {CLAIM_RULES.map((c) => (
            <li key={c.id}>
              <label className="switch-row">
                <span className="switch-text">
                  <span className="switch-label">{c.label}</span>
                  <span className="switch-description" id={`pref-claim-${c.id}-desc`}>
                    {c.rule}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={!prefs.claimsHidden.includes(c.id)}
                  aria-describedby={`pref-claim-${c.id}-desc`}
                  data-testid={`pref-claim-${c.id}`}
                  onChange={(e) => {
                    toggleClaim(c.id, e.target.checked);
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
      </Feature>
    </>
  );
}
