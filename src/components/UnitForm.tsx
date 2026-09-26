import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { decimalInput } from '../lib/format.ts';
import { parseCustomUnit, type FoodUnit } from '../lib/units.ts';

interface UnitFormProps {
  /** Enheten som redigeras, annars skapas en ny. */
  unit: FoodUnit | null;
  /** Övriga egna enheter – namnen måste vara unika. */
  others: readonly FoodUnit[];
  onSave: (unit: FoodUnit) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Namn och gram för en egen enhet. Inte ett eget `<form>` – den ligger ofta inuti
 * loggnings- eller livsmedelsformuläret – så Enter och knapparna hanteras här.
 */
export function UnitForm({ unit, others, onSave, onCancel }: UnitFormProps) {
  const [name, setName] = useState(unit?.name ?? '');
  const [grams, setGrams] = useState(unit ? decimalInput(unit.grams) : '');
  const [error, setError] = useState<string | null>(null);

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseCustomUnit(name, grams, others);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await onSave(result.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void save(event);
  }

  return (
    <div className="unit-form" role="group" aria-label={unit ? 'Ändra enhet' : 'Ny enhet'}>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Enhetens namn</span>
          <input
            className="input"
            autoComplete="off"
            placeholder="t.ex. st, skiva, burk"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <label className="field">
          <span className="field-label">Gram per enhet</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={grams}
            onChange={(e) => {
              setGrams(e.target.value);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button button-small" onClick={(e) => void save(e)}>
          Spara enhet
        </button>
        <button type="button" className="button button-secondary button-small" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  );
}
