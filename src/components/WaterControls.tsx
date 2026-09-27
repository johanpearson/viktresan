import { useState, type SyntheticEvent } from 'react';
import { addWater, undoLastWater, type WaterEntry } from '../db/db.ts';
import { formatMl } from '../lib/format.ts';
import { haptic } from '../lib/haptics.ts';
import { parseWaterAmount } from '../lib/validation.ts';
import { WATER_QUICK_ADD } from '../lib/water.ts';

interface WaterControlsProps {
  date: string;
  water: readonly WaterEntry[];
  onChange: () => Promise<unknown>;
  /** Visa fältet för valfri mängd (annars en länk till Logga → Dryck). */
  custom?: boolean;
  /** `chips`: små sekundära knappar på en rad (Översikt → Idag). */
  variant?: 'buttons' | 'chips';
}

/** Glas, flaska, kopp kaffe/te, valfri mängd och Ångra senaste för en dag. */
export function WaterControls({
  date,
  water,
  onChange,
  custom = false,
  variant = 'buttons',
}: WaterControlsProps) {
  const chips = variant === 'chips';
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const hasEntries = water.some((w) => w.date === date);

  async function add(ml: number) {
    await addWater(date, ml);
    haptic('light');
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
    <div className={chips ? 'water-controls water-controls-chips' : 'water-controls'}>
      <div className={custom ? 'water-quick water-quick-3' : 'water-quick'}>
        {WATER_QUICK_ADD.map(({ ml, label }) => (
          <button
            key={ml}
            type="button"
            className={chips ? 'button button-secondary button-small chip' : 'button'}
            onClick={() => void add(ml)}
          >
            <span className="water-quick-amount">+{formatMl(ml)}</span>{' '}
            <span className="water-quick-label">{label}</span>
          </button>
        ))}
        {!custom && (
          <a
            className={chips ? 'button button-ghost button-small chip' : 'button button-secondary'}
            href="#/logga/vatten"
          >
            Valfri mängd
          </a>
        )}
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
        className={
          chips
            ? 'button button-ghost button-small water-undo'
            : 'button button-secondary button-small water-undo'
        }
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
