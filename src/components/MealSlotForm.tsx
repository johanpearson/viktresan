import { useState, type SyntheticEvent } from 'react';
import {
  MEAL_KIND_LABELS,
  MEAL_NAME_MAX,
  mealSlotError,
  type MealKind,
  type MealSlot,
} from '../lib/mealSlots.ts';
import { ChoiceList } from './ChoiceList.tsx';

export interface MealSlotValues {
  name: string;
  time: string;
  kind: MealKind;
}

interface MealSlotFormProps {
  /** Måltiden som redigeras, `null` = ny måltid. */
  slot: MealSlot | null;
  /** Övriga måltider (namnet måste vara unikt). */
  others: readonly MealSlot[];
  onSave: (values: MealSlotValues) => void;
  /** "Ta bort måltiden" längst ner (saknas för en ny måltid och för den enda måltiden). */
  onRemove?: (() => void) | undefined;
}

const KIND_OPTIONS = (['huvudmal', 'mellanmal'] as const).map((id) => ({
  id,
  label: MEAL_KIND_LABELS[id],
}));

/** Inställningar → Måltider: namn, ungefärlig tid och typ för en måltid. */
export function MealSlotForm({ slot, others, onSave, onRemove }: MealSlotFormProps) {
  const [name, setName] = useState(slot?.name ?? '');
  const [time, setTime] = useState(slot?.time ?? '');
  const [kind, setKind] = useState<MealKind>(slot?.kind ?? 'mellanmal');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    const problem = mealSlotError({ name, time }, others);
    if (problem) {
      setError(problem);
      return;
    }
    onSave({ name: name.trim(), time, kind });
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate data-testid="meal-slot-form">
      <label className="field">
        <span className="field-label">Namn</span>
        <input
          className="input"
          type="text"
          maxLength={MEAL_NAME_MAX}
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">Ungefärlig tid</span>
        <input
          className="input"
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            setError(null);
          }}
        />
      </label>
      <ChoiceList
        legend="Typ"
        name="meal-kind"
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
      />
      <p className="form-note muted">
        Tiden avgör vilken måltid som är förvald när du loggar och vilken som är utfälld i Mat.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button">
        Spara måltid
      </button>
      {onRemove && (
        <button
          type="button"
          className="button button-ghost button-small button-danger-text"
          onClick={onRemove}
        >
          Ta bort måltiden
        </button>
      )}
    </form>
  );
}
