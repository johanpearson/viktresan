import { FEATURES, setFeature, useFeatures } from '../lib/features.ts';

/** Inställningar → Funktioner. Avstängda funktioner döljs, datan ligger kvar. */
export function FeatureSettings() {
  const { flags } = useFeatures();
  return (
    <section className="card" aria-labelledby="features-title">
      <h2 className="card-title" id="features-title">
        Funktioner
      </h2>
      <p className="form-note">
        Stäng av det du inte använder. Datan ligger kvar och följer med i säkerhetskopian.
      </p>
      <ul className="switch-list">
        {FEATURES.map((f) => (
          <li key={f.id}>
            <label className="switch-row">
              <span className="switch-text">
                <span className="switch-label">{f.label}</span>
                <span className="switch-description" id={`feature-${f.id}-desc`}>
                  {f.available ? f.description : `${f.description} Kommer snart.`}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={flags[f.id]}
                disabled={!f.available}
                aria-describedby={`feature-${f.id}-desc`}
                onChange={(e) => void setFeature(f.id, e.target.checked)}
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
