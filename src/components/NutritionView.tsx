import { useMemo, useState } from 'react';
import type { NutrientGroup } from '../data/nutrients.ts';
import { UPPER_LIMITS_SOURCE, UPPER_LIMITS_URL } from '../data/upperLimits.ts';
import type { FoodLogEntry, SavedMeal, SupplementIntake } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatNutrient, formatNutrientValue } from '../lib/format.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import {
  dayNutrition,
  upperLimitWarnings,
  weekNutrition,
  type NutrientDayRow,
} from '../lib/micronutrients.ts';
import { Card } from './Card.tsx';
import { DateBar } from './DateBar.tsx';
import { Disclosure } from './Disclosure.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { StatBar } from './StatBar.tsx';
import { UpperLimitWarnings } from './UpperLimitWarnings.tsx';

interface NutritionViewProps {
  foodLog: readonly FoodLogEntry[];
  meals: readonly SavedMeal[];
  /** Livsmedelsverkets livsmedel (med vitaminer och mineraler), `null` medan de laddas. */
  livsmedel: readonly FoodItem[] | null;
  supplementLog: readonly SupplementIntake[];
  /** Tillskott påslaget: visa uppdelningen mat/tillskott. */
  supplements: boolean;
}

type Period = 'dag' | 'vecka';

const PERIODS: readonly { id: Period; label: string }[] = [
  { id: 'dag', label: 'Dag' },
  { id: 'vecka', label: 'Snitt 7 dagar' },
];

const GROUPS: readonly { id: NutrientGroup; title: string }[] = [
  { id: 'vitamin', title: 'Vitaminer' },
  { id: 'mineral', title: 'Mineraler' },
];

const percentFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

function Row({ row, supplements }: { row: NutrientDayRow; supplements: boolean }) {
  const ri = row.ri ?? 0;
  const parts: string[] = [];
  if (row.total === 0) parts.push('Inget registrerat');
  else if (supplements) {
    parts.push(`Mat ${formatNutrient(row.food, row.unit)}`);
    parts.push(`Tillskott ${formatNutrient(row.supplements, row.unit)}`);
  }
  if (ri > 0 && row.total > 0) {
    parts.push(`${percentFormat.format((row.total / ri) * 100).replace(/\s/g, ' ')} % av RI`);
  }
  return (
    <li className="nutrient-row" data-testid="nutrient-row" data-key={row.key}>
      <StatBar
        title={row.label}
        value={row.total}
        goal={ri > 0 ? ri : null}
        unit={row.unit}
        tone="food"
        label={`${row.label} mot referensintaget`}
        valueText={`${formatNutrient(row.total, row.unit)} av ${formatNutrient(ri, row.unit)}`}
        display={
          <>
            <strong>{formatNutrientValue(row.total)}</strong>
            {ri > 0 ? ` / ${formatNutrient(ri, row.unit)}` : ` ${row.unit}`}
          </>
        }
        segments={
          ri > 0
            ? [
                { fraction: row.food / ri, tone: 'food' },
                { fraction: row.supplements / ri, tone: 'supplement' },
              ]
            : undefined
        }
        meta={parts.join(' · ')}
      />
    </li>
  );
}

/**
 * Mat → Näring: vitaminer och mineraler en dag (eller snitt 7 dagar), uppdelat på mat
 * och tillskott, som staplar mot referensintaget. Varning när EFSA:s övre gräns
 * överskrids. Matens värden finns bara för Livsmedelsverkets livsmedel.
 */
export function NutritionView({
  foodLog,
  meals,
  livsmedel,
  supplementLog,
  supplements,
}: NutritionViewProps) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState<Period>('dag');
  const extra = useMemo(
    () => new Map((livsmedel ?? []).map((f) => [f.id, f.extra ?? null])),
    [livsmedel],
  );
  const input = {
    foodLog,
    meals,
    lookup: (id: string) => extra.get(id),
    supplementLog: supplements ? supplementLog : [],
  };
  const day = period === 'dag' ? dayNutrition(date, input) : weekNutrition(date, input);
  const warnings = period === 'dag' ? upperLimitWarnings(day) : [];
  const when = date === today ? 'idag' : formatDate(date);

  return (
    <div className="nutrition" data-testid="nutrition">
      <DateBar date={date} today={today} label="Datum" testId="nutrition-date" onChange={setDate} />
      <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
      <UpperLimitWarnings warnings={warnings} when={when} />
      {day.estimatedEntries > 0 && (
        <p className="form-note" role="note" data-testid="nutrition-estimated">
          {period === 'dag' ? `Näringen ${when} är ofullständig: ` : 'Näringen är ofullständig: '}
          {day.estimatedEntries === 1
            ? '1 snabblogg har bara uppskattade kcal'
            : `${String(day.estimatedEntries)} snabbloggar har bara uppskattade kcal`}{' '}
          och ingår inte i vitaminer och mineraler.
        </p>
      )}
      {day.loggedDays === 0 && (
        <p className="form-note muted">
          {period === 'dag'
            ? `Inget loggat ${when}.`
            : 'Inget loggat de sju dagarna fram till och med datumet.'}
        </p>
      )}
      {GROUPS.map((group) => (
        <Card key={group.id} title={group.title}>
          {supplements && (
            <p className="bar-legend" aria-hidden="true">
              <span className="bar-legend-item">
                <span className="bar-legend-swatch tone-food" />
                Mat
              </span>
              <span className="bar-legend-item">
                <span className="bar-legend-swatch tone-supplement" />
                Tillskott
              </span>
            </p>
          )}
          <ul className="nutrient-rows">
            {day.rows
              .filter((r) => r.group === group.id)
              .map((r) => (
                <Row key={r.key} row={r} supplements={supplements} />
              ))}
          </ul>
        </Card>
      ))}
      <p className="form-note muted" data-testid="nutrition-coverage">
        {period === 'vecka' && day.loggedDays > 0
          ? `Snitt per loggad dag · ${String(day.loggedDays)} av 7 dagar loggade. `
          : ''}
        {day.partsWithoutData > 0
          ? `${String(day.partsWithoutData)} av ${String(day.foodParts)} livsmedel saknar vitamin- och mineraldata – ofta produkter från Open Food Facts och egna livsmedel – så totalen kan vara i underkant.`
          : 'Livsmedel från Open Food Facts saknar ofta vitamindata, så totalen kan vara i underkant.'}
      </p>
      <Disclosure summary="Om siffrorna">
        <p className="form-note muted">
          Referensintaget (RI) är EU:s värden för en genomsnittlig vuxen (förordning 1169/2011),
          samma som "% av RI" på förpackningar – inga personliga mål. Matens värden kommer från
          Livsmedelsverkets livsmedelsdatabas.
        </p>
        <p className="form-note muted">
          Varningarna bygger på{' '}
          <a href={UPPER_LIMITS_URL} target="_blank" rel="noopener noreferrer">
            {UPPER_LIMITS_SOURCE}
          </a>
          .
        </p>
      </Disclosure>
    </div>
  );
}
