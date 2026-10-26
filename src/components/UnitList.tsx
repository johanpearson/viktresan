import { useState } from 'react';
import { formatGrams } from '../lib/format.ts';
import { unitRemovalText } from '../lib/removal.ts';
import { UNIT_SOURCE_LABELS, formatBase, type BaseUnit, type FoodUnit } from '../lib/units.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { DetailSheet } from './DetailSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';
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

/**
 * Livsmedlets enheter med vikt och källa. En egen enhet: tryck = detaljvyn (Redigera, Ta bort
 * med bekräftelse), svep vänster = ta bort direkt med Ångra. Loggade poster behåller sin vikt.
 */
export function UnitList({ builtIn, base = 'g', custom, onChange, canAdd = false }: UnitListProps) {
  // Index i `custom` som redigeras, 'ny' för en ny enhet.
  const [editing, setEditing] = useState<number | 'ny' | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const toast = useUndoToast();
  const customNames = new Set(custom.map((u) => u.name.toLocaleLowerCase('sv')));
  const shown = builtIn.filter((u) => !customNames.has(u.name.toLocaleLowerCase('sv')));
  const detailUnit = detail !== null ? custom[detail] : undefined;

  async function remove(index: number) {
    const unit = custom[index];
    if (!unit) return;
    const before = [...custom];
    setDetail(null);
    setEditing(null);
    await onChange(custom.filter((_, i) => i !== index));
    toast.show(`Tog bort enheten ${unit.name}.`, () => onChange(before));
  }

  return (
    <div className="unit-list">
      <ul className="list list-flush" aria-label="Enheter">
        <ListRow primary="g" secondary="Gram" />
        {shown.map((u) => (
          <ListRow
            key={`${u.source}:${u.name}`}
            testId="unit-entry"
            primary={`1 ${u.name} ≈ ${formatBase(u.grams, base)}`}
            secondary={UNIT_SOURCE_LABELS[u.source]}
          />
        ))}
        {custom.map((u, i) =>
          editing === i ? (
            <li key={`egen:${u.name}`} className="unit-edit">
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
            <ListRow
              key={`egen:${u.name}`}
              testId="unit-entry"
              primary={`1 ${u.name} = ${formatGrams(u.grams)}`}
              secondary={UNIT_SOURCE_LABELS.egen}
              chevron
              onClick={() => {
                toast.close();
                setDetail(i);
              }}
              swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(i) }}
            />
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
              toast.close();
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
      {detail !== null && detailUnit && (
        <DetailSheet
          title={`Enheten ${detailUnit.name}`}
          testId="unit-detail"
          onClose={() => {
            setDetail(null);
          }}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          remove={{
            label: 'Ta bort enheten',
            title: `Ta bort enheten ${detailUnit.name}?`,
            consequence: unitRemovalText(),
            onConfirm: () => void remove(detail),
          }}
        >
          <ListRow
            primary="Vikt"
            value={
              <span className="num">{`1 ${detailUnit.name} = ${formatGrams(detailUnit.grams)}`}</span>
            }
          />
          <ListRow primary="Källa" value={UNIT_SOURCE_LABELS.egen} />
        </DetailSheet>
      )}
      {toast.toast && (
        <Toast
          label="Enheter"
          testId="unit-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </div>
  );
}
