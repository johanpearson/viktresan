import { useState, type SyntheticEvent } from 'react';
import { isNutrientKey, type NutrientKey } from '../data/nutrients.ts';
import {
  newId,
  putSupplement,
  type Supplement,
  type SupplementForm as Form,
  type SupplementNutrient,
  type SupplementSchedule,
} from '../db/db.ts';
import { decimalInput, formatNutrient, parseDecimal } from '../lib/format.ts';
import {
  SUPPLEMENT_NUTRIENTS,
  convertAmount,
  nutrientInfo,
  unitsFor,
  type AmountUnit,
} from '../lib/nutrientUnits.ts';
import { SUPPLEMENT_FORMS, SUPPLEMENT_SCHEDULES } from '../lib/supplements.ts';
import {
  parseSupplementFields,
  type SupplementFields,
  type SupplementNutrientField,
} from '../lib/validation.ts';
import { ChipGroup } from './ChipGroup.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';

/** Förifyllda värden: från Open Food Facts eller AI-importen av etiketten. */
export interface SupplementPrefill {
  name?: string;
  form?: Form;
  amountPerDose?: number;
  nutrients?: SupplementNutrient[];
  ean?: string;
}

interface SupplementFormProps {
  /** Tillskottet som redigeras, annars skapas ett nytt. */
  supplement: Supplement | null;
  prefill?: SupplementPrefill | undefined;
  /** Var värdena kommer ifrån, t.ex. "Förifyllt från Open Food Facts – kontrollera mot etiketten." */
  note?: string | undefined;
  onSaved: (supplement: Supplement) => void;
  onCancel: () => void;
  /** Visar "Ta bort tillskottet" längst ner (bara vid redigering). */
  onDelete?: () => void;
}

const WEEKDAYS = [
  { id: '0', label: 'mån', ariaLabel: 'måndag' },
  { id: '1', label: 'tis', ariaLabel: 'tisdag' },
  { id: '2', label: 'ons', ariaLabel: 'onsdag' },
  { id: '3', label: 'tor', ariaLabel: 'torsdag' },
  { id: '4', label: 'fre', ariaLabel: 'fredag' },
  { id: '5', label: 'lör', ariaLabel: 'lördag' },
  { id: '6', label: 'sön', ariaLabel: 'söndag' },
] as const;

type WeekdayId = (typeof WEEKDAYS)[number]['id'];

const text = (v: number) => decimalInput(Math.round(v * 1000) / 1000).replace(/,0$/, '');

function fieldsFor(s: Supplement | null, prefill: SupplementPrefill | undefined): SupplementFields {
  const source = s ?? prefill;
  return {
    name: source?.name ?? '',
    form: source?.form ?? 'tablett',
    amountPerDose: text(source?.amountPerDose ?? 1),
    nutrients: (source?.nutrients ?? []).map((n) => ({
      key: n.key,
      amount: String(Math.round(n.amount * 1000) / 1000).replace('.', ','),
      unit: n.unit,
    })),
    schedule: s?.schedule ?? 'dagligen',
    weekdays: s?.weekdays ?? [],
    dosesPerDay: String(s?.dosesPerDay ?? 1),
    ean: s?.ean ?? prefill?.ean ?? '',
  };
}

/** Skapa eller redigera ett tillskott: namn, form, dos, näringsämnen per dos, schema, streckkod. */
export function SupplementForm({
  supplement,
  prefill,
  note,
  onSaved,
  onCancel,
  onDelete,
}: SupplementFormProps) {
  const [fields, setFields] = useState<SupplementFields>(() => fieldsFor(supplement, prefill));
  const [error, setError] = useState<string | null>(null);
  const form = SUPPLEMENT_FORMS.find((f) => f.id === fields.form);
  const chosen = new Set(fields.nutrients.map((n) => n.key));
  const available = SUPPLEMENT_NUTRIENTS.filter((n) => !chosen.has(n.key));

  function update<K extends keyof SupplementFields>(key: K, value: SupplementFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function updateNutrient(key: NutrientKey, patch: Partial<SupplementNutrientField>) {
    setFields((prev) => ({
      ...prev,
      nutrients: prev.nutrients.map((n) => (n.key === key ? { ...n, ...patch } : n)),
    }));
  }

  /** Byte av enhet räknar om det ifyllda värdet (D-vitamin: µg ↔ IE). */
  function changeUnit(row: SupplementNutrientField, unit: AmountUnit) {
    const value = parseDecimal(row.amount);
    const converted = value == null ? null : convertAmount(row.key, value, row.unit, unit);
    updateNutrient(row.key, {
      unit,
      amount: converted == null ? row.amount : text(converted),
    });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseSupplementFields(fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = Date.now();
    const saved: Supplement = {
      id: supplement?.id ?? newId(),
      createdAt: supplement?.createdAt ?? now,
      ...result.value,
    };
    if (supplement) saved.updatedAt = now;
    await putSupplement(saved);
    onSaved(saved);
  }

  return (
    <form
      className="form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="supplement-form-title"
      data-testid="supplement-form"
    >
      <h2 className="card-title" id="supplement-form-title">
        {supplement ? 'Redigera tillskott' : 'Nytt tillskott'}
      </h2>
      {note && <p className="form-note muted">{note}</p>}
      <label className="field">
        <span className="field-label">Namn</span>
        <input
          className="input"
          autoComplete="off"
          value={fields.name}
          onChange={(e) => {
            update('name', e.target.value);
          }}
        />
      </label>
      <ChipGroup
        label="Enhet"
        options={SUPPLEMENT_FORMS.map((f) => ({ id: f.id, label: f.one }))}
        selected={[fields.form]}
        onToggle={(id) => {
          update('form', id);
        }}
      />
      <label className="field">
        <span className="field-label">Mängd per dos ({form?.many ?? fields.form})</span>
        <input
          className="input"
          inputMode="decimal"
          autoComplete="off"
          value={fields.amountPerDose}
          onChange={(e) => {
            update('amountPerDose', e.target.value);
          }}
        />
      </label>

      <fieldset className="fieldset">
        <legend className="field-label">Näringsämnen per dos</legend>
        {fields.nutrients.length > 0 && (
          <ul className="nutrient-fields">
            {fields.nutrients.map((row) => {
              const info = nutrientInfo(row.key);
              const units = unitsFor(row.key);
              const value = parseDecimal(row.amount);
              // D-vitamin: visa värdet i den andra enheten också (25 µg = 1 000 IE).
              const other = units.find((u) => u !== row.unit);
              const converted =
                other && value != null ? convertAmount(row.key, value, row.unit, other) : null;
              return (
                <li key={row.key} className="nutrient-field" data-testid="nutrient-field">
                  <label className="nutrient-field-amount">
                    <span className="field-label">{info.label}</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      autoComplete="off"
                      value={row.amount}
                      onChange={(e) => {
                        updateNutrient(row.key, { amount: e.target.value });
                      }}
                    />
                  </label>
                  {units.length > 1 ? (
                    <label className="nutrient-field-unit">
                      <span className="visually-hidden">Enhet {info.label}</span>
                      <select
                        className="input"
                        value={row.unit}
                        onChange={(e) => {
                          changeUnit(row, e.target.value as AmountUnit);
                        }}
                      >
                        {units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="nutrient-field-unit nutrient-field-static">{row.unit}</span>
                  )}
                  <button
                    type="button"
                    className="button button-ghost button-small button-danger-text"
                    aria-label={`Ta bort ${info.label}`}
                    onClick={() => {
                      update(
                        'nutrients',
                        fields.nutrients.filter((n) => n.key !== row.key),
                      );
                    }}
                  >
                    Ta bort
                  </button>
                  {converted != null && other && (
                    <span className="nutrient-field-hint" data-testid="unit-conversion">
                      = {formatNutrient(converted, other)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {available.length > 0 && (
          <label className="field">
            <span className="visually-hidden">Lägg till näringsämne</span>
            <select
              className="input"
              value=""
              onChange={(e) => {
                const key = e.target.value;
                if (!isNutrientKey(key)) return;
                update('nutrients', [
                  ...fields.nutrients,
                  { key, amount: '', unit: nutrientInfo(key).unit },
                ]);
              }}
            >
              <option value="">+ Lägg till näringsämne</option>
              {available.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label} ({n.unit})
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <SegmentedControl
        label="Hur ofta"
        showLabel
        options={SUPPLEMENT_SCHEDULES}
        value={fields.schedule}
        onChange={(id: SupplementSchedule) => {
          update('schedule', id);
        }}
      />
      {fields.schedule === 'veckodagar' && (
        <ChipGroup<WeekdayId>
          label="Veckodagar"
          columns={7}
          options={WEEKDAYS}
          selected={fields.weekdays.map((d) => String(d) as WeekdayId)}
          onToggle={(id) => {
            const day = Number(id);
            update(
              'weekdays',
              fields.weekdays.includes(day)
                ? fields.weekdays.filter((d) => d !== day)
                : [...fields.weekdays, day],
            );
          }}
        />
      )}
      <label className="field">
        <span className="field-label">Doser per dag</span>
        <input
          className="input"
          inputMode="numeric"
          autoComplete="off"
          value={fields.dosesPerDay}
          onChange={(e) => {
            update('dosesPerDay', e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">Streckkod (valfri)</span>
        <input
          className="input"
          inputMode="numeric"
          autoComplete="off"
          value={fields.ean}
          onChange={(e) => {
            update('ean', e.target.value);
          }}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button">
          Spara tillskott
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
      {onDelete && (
        <button
          type="button"
          className="button button-ghost button-small button-danger-text"
          onClick={onDelete}
        >
          Ta bort tillskottet
        </button>
      )}
    </form>
  );
}
