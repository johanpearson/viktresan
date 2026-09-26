import { useState } from 'react';

const OTHER = '__annan';

interface WorkoutTypeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Förval och egna typer (se `workoutTypes`). */
  types: readonly string[];
}

/** Typ av pass: välj bland förval och egna typer, eller skriv en ny. */
export function WorkoutTypeField({ value, onChange, types }: WorkoutTypeFieldProps) {
  const [custom, setCustom] = useState(() => value !== '' && !types.includes(value));
  return (
    <>
      <label className="field">
        <span className="field-label">Typ</span>
        <select
          className="input"
          value={custom ? OTHER : value}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setCustom(true);
              onChange('');
            } else {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={OTHER}>Egen typ…</option>
        </select>
      </label>
      {custom && (
        <label className="field">
          <span className="field-label">Egen typ</span>
          <input
            className="input"
            autoComplete="off"
            maxLength={60}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        </label>
      )}
    </>
  );
}
