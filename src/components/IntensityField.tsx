import { INTENSITIES } from '../lib/workouts.ts';

/** Valfri intensitet som rullista. '' = ingen. */
export function IntensityField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">Intensitet (valfri)</span>
      <select
        className="input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">Ingen</option>
        {INTENSITIES.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}
