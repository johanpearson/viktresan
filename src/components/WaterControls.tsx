import { useState, type SyntheticEvent } from 'react';
import { addWater, undoLastWater, type WaterEntry } from '../db/db.ts';
import { formatMl } from '../lib/format.ts';
import { parseWaterAmount } from '../lib/validation.ts';
import { WATER_QUICK_ADD } from '../lib/water.ts';

interface WaterControlsProps {
  date: string;
  water: readonly WaterEntry[];
  onChange: () => Promise<unknown>;
  /** Visa fältet för valfri mängd. */
  custom?: boolean;
}

/** +250 ml, +500 ml, valfri mängd och Ångra senaste för en dag. */
export function WaterControls({ date, water, onChange, custom = false }: WaterControlsProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const hasEntries = water.some((w) => w.date === date);

  async function add(ml: number) {
    await addWater(date, ml);
    await onChange();
    setError(null);
    setStatus(`La till ${formatMl(ml)}.`);
  }

  async function undo() {
    const removed = await undoLastWater(date);
    await onChange();
    setStatus(removed ? `Ångrade ${formatMl(removed.ml)}.` : null);
  }

  async function handleCustom(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseWaterAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    await add(parsed.value);
    setAmount('');
  }

  return (
    <div className="water-controls">
      <div className="button-row">
        {WATER_QUICK_ADD.map((ml) => (
          <button
            key={ml}
            type="button"
            className="button"
            aria-label={`Lägg till ${formatMl(ml)} vatten`}
            onClick={() => void add(ml)}
          >
            +{formatMl(ml)}
          </button>
        ))}
      </div>
      {custom && (
        <form className="water-custom" onSubmit={(e) => void handleCustom(e)} noValidate>
          <label className="field">
            <span className="field-label">Valfri mängd (ml)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
          </label>
          <button type="submit" className="button button-secondary">
            Lägg till
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button button-secondary button-small water-undo"
        disabled={!hasEntries}
        onClick={() => void undo()}
      >
        Ångra senaste
      </button>
      <p className="form-ok" role="status">
        {status}
      </p>
    </div>
  );
}
