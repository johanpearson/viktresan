import { useFeatures } from '../lib/features.ts';
import { OVERVIEW_ITEMS, useOverviewItems } from '../lib/overviewItems.ts';

const GROUPS = [
  { id: 'ring', legend: 'Ringar i Idag' },
  { id: 'kort', legend: 'Kort' },
] as const;

/** Inställningar → Översikt: dölj enskilda ringar och kort. Gäller den här enheten. */
export function OverviewSettings() {
  const features = useFeatures();
  const { shows, setShown } = useOverviewItems();
  const items = features.filter(OVERVIEW_ITEMS);
  return (
    <>
      <p className="form-note">
        Viktkortet visas alltid. Dolda delar finns kvar där de hör hemma – Mat, Logga och Framsteg.
      </p>
      {GROUPS.map((group) => {
        const rows = items.filter((i) => i.group === group.id);
        if (rows.length === 0) return null;
        return (
          <fieldset className="switch-group" key={group.id}>
            <legend className="field-label">{group.legend}</legend>
            <ul className="switch-list">
              {rows.map((item) => (
                <li key={item.id}>
                  <label className="switch-row">
                    <span className="switch-text">
                      <span className="switch-label">{item.label}</span>
                      <span className="switch-description" id={`overview-${item.id}-desc`}>
                        {item.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={shows(item.id)}
                      aria-describedby={`overview-${item.id}-desc`}
                      data-testid={`overview-${item.id}`}
                      onChange={(e) => void setShown(item.id, e.target.checked)}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
    </>
  );
}
