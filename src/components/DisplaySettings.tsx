import { setPreference, usePreferences } from '../lib/preferences.ts';

/** Inställningar → Visning. Gäller den här enheten. */
export function DisplaySettings() {
  const { prefs } = usePreferences();
  return (
    <section className="card" aria-labelledby="display-title">
      <h2 className="card-title" id="display-title">
        Visning
      </h2>
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
      </ul>
    </section>
  );
}
