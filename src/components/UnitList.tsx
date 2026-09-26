import { useState } from 'react';
import { formatGrams } from '../lib/format.ts';
import { UNIT_SOURCE_LABELS, formatBase, type BaseUnit, type FoodUnit } from '../lib/units.ts';
import { UnitForm } from './UnitForm.tsx';

interface UnitListProps {
  /** Livsmedlets övriga enheter (volym, standard, gissning, Open Food Facts …) – visas bara. */
  builtIn: readonly FoodUnit[];
  /** Vad enheternas vikt anges i (ml för livsmedel med värden per 100 ml). */
  base?: BaseUnit;
  /** Användarens egna enheter – kan ändras och tas bort. */
  custom: readonly FoodUnit[];
  onChange: (custom: FoodUnit[]) => void | Promise<void>;
  /** Visa knappen "Lägg till enhet" i listan. */
  canAdd?: boolean;
}

/** Livsmedlets enheter med vikt och källa; egna enheter kan redigeras och tas bort. */
export function UnitList({ builtIn, base = 'g', custom, onChange, canAdd = false }: UnitListProps) {
  // Index i `custom` som redigeras, 'ny' för en ny enhet.
  const [editing, setEditing] = useState<number | 'ny' | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const customNames = new Set(custom.map((u) => u.name.toLocaleLowerCase('sv')));
  const shown = builtIn.filter((u) => !customNames.has(u.name.toLocaleLowerCase('sv')));

  async function remove(index: number) {
    if (confirm !== index) {
      setConfirm(index);
      return;
    }
    setConfirm(null);
    await onChange(custom.filter((_, i) => i !== index));
  }

  return (
    <div className="unit-list">
      <ul className="entry-list" aria-label="Enheter">
        <li className="entry unit-entry">
          <div className="entry-main">
            <span className="entry-date">g</span>
            <span className="muted-inline">Gram</span>
          </div>
        </li>
        {shown.map((u) => (
          <li key={`${u.source}:${u.name}`} className="entry unit-entry" data-testid="unit-entry">
            <div className="entry-main">
              <span className="entry-date">
                1 {u.name} ≈ {formatBase(u.grams, base)}
              </span>
              <span className="muted-inline">{UNIT_SOURCE_LABELS[u.source]}</span>
            </div>
          </li>
        ))}
        {custom.map((u, i) =>
          editing === i ? (
            <li key={`egen:${u.name}`} className="entry unit-entry">
              <UnitForm
                unit={u}
                others={custom.filter((_, j) => j !== i)}
                onSave={async (next) => {
                  setEditing(null);
                  await onChange(custom.map((c, j) => (j === i ? next : c)));
                }}
                onCancel={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={`egen:${u.name}`} className="entry unit-entry" data-testid="unit-entry">
              <div className="entry-main">
                <span className="entry-date">
                  1 {u.name} = {formatGrams(u.grams)}
                </span>
                <span className="muted-inline">{UNIT_SOURCE_LABELS.egen}</span>
              </div>
              <div className="entry-actions">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  aria-label={`Redigera enheten ${u.name}`}
                  onClick={() => {
                    setConfirm(null);
                    setEditing(i);
                  }}
                >
                  Redigera
                </button>
                <button
                  type="button"
                  className="button button-danger button-small"
                  aria-label={
                    confirm === i
                      ? `Bekräfta borttagning av ${u.name}`
                      : `Ta bort enheten ${u.name}`
                  }
                  onClick={() => void remove(i)}
                >
                  {confirm === i ? 'Bekräfta' : 'Ta bort'}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {canAdd &&
        (editing === 'ny' ? (
          <UnitForm
            unit={null}
            others={custom}
            onSave={async (unit) => {
              setEditing(null);
              await onChange([...custom, unit]);
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => {
              setConfirm(null);
              setEditing('ny');
            }}
          >
            Lägg till egen enhet
          </button>
        ))}
      <p className="form-note muted">
        Standard- och volymenheterna är ungefärliga (volym räknas om med en typisk densitet för
        livsmedlet). Ändrar du en enhet påverkas inte det du redan loggat.
      </p>
    </div>
  );
}
