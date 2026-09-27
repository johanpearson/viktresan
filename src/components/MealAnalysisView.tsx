import { useMemo } from 'react';
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatInt, formatKcal } from '../lib/format.ts';
import {
  FIBER_PER_1000_KCAL_GOAL,
  analyzeEntries,
  keyFigureNotes,
  type Goals,
  type NutrientRow,
} from '../lib/mealAnalysis.ts';
import { suggestSwaps, swapCandidates } from '../lib/swaps.ts';

interface MealAnalysisViewProps {
  entries: readonly FoodLogEntry[];
  meals: readonly SavedMeal[];
  /** Alla livsmedel (Livsmedelsverket, egna, måltider) efter id. */
  catalog: ReadonlyMap<string, FoodItem>;
  /** Livsmedelsverkets livsmedel – kandidater till bytesförslag. */
  foods: readonly FoodItem[];
  goals: Goals;
  /** "måltiden" eller "dagen" – i texterna. */
  what: string;
  onAskAi: () => void;
}

const GROUPS: readonly { id: NutrientRow['group']; title: string }[] = [
  { id: 'energi', title: 'Energi och makron' },
  { id: 'ovrigt', title: 'Fiber, socker och salt' },
  { id: 'vitamin', title: 'Vitaminer' },
  { id: 'mineral', title: 'Mineraler' },
];

const percentFormat = new Intl.NumberFormat('sv-SE', {
  style: 'percent',
  maximumFractionDigits: 0,
});
const amountFormat = new Intl.NumberFormat('sv-SE', { maximumSignificantDigits: 3 });
const decimalFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

function spaces(text: string): string {
  return text.replace(/\s/g, ' ');
}

function percent(value: number | null): string {
  return value === null ? '–' : spaces(percentFormat.format(value));
}

function amount(row: NutrientRow): string {
  if (row.unit === 'kcal') return formatKcal(row.amount);
  const value =
    row.amount >= 100 ? formatInt(Math.round(row.amount)) : amountFormat.format(row.amount);
  return `${spaces(value)} ${row.unit}`;
}

/**
 * Lokal analys (ingen AI, fungerar offline): summor i procent av dagsmål och
 * referensintag, nyckeltal och bytesförslag för posterna som bidrar mest med energi.
 */
export function MealAnalysisView({
  entries,
  meals,
  catalog,
  foods,
  goals,
  what,
  onAskAi,
}: MealAnalysisViewProps) {
  const analysis = analyzeEntries(entries, meals, (id) => catalog.get(id)?.extra, goals);
  const candidates = useMemo(() => swapCandidates(foods), [foods]);
  const swaps = useMemo(
    () => suggestSwaps(entries, candidates, catalog),
    [entries, candidates, catalog],
  );
  const notes = keyFigureNotes(analysis);
  const partial = analysis.rows.some((r) => r.coverage < 0.999);

  return (
    <div className="analysis" data-testid="analysis">
      <section aria-labelledby="analysis-key-title">
        <h3 className="analysis-title" id="analysis-key-title">
          Nyckeltal
        </h3>
        <dl className="kv kv-compact" data-testid="analysis-key-figures">
          <dt>Andel av dagens kalorimål</dt>
          <dd>{analysis.shareOfTarget === null ? 'Inget mål' : percent(analysis.shareOfTarget)}</dd>
          <dt>Protein per 100 kcal</dt>
          <dd>
            {analysis.proteinPer100Kcal === null
              ? '–'
              : `${spaces(decimalFormat.format(analysis.proteinPer100Kcal))} g`}
          </dd>
          <dt>Fiber per 1 000 kcal</dt>
          <dd>
            {analysis.fiberPer1000Kcal === null
              ? 'Okänt'
              : `${spaces(decimalFormat.format(analysis.fiberPer1000Kcal))} g (rekommendation ca ${String(FIBER_PER_1000_KCAL_GOAL)} g)`}
          </dd>
        </dl>
        {notes.length > 0 && (
          <ul className="analysis-notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="analysis-swaps-title">
        <h3 className="analysis-title" id="analysis-swaps-title">
          Bytesförslag
        </h3>
        {swaps.length === 0 ? (
          <p className="muted">
            Inga tydligt bättre byten hittades för det som bidrar mest med energi.
          </p>
        ) : (
          <ul className="analysis-swaps" data-testid="swap-suggestions">
            {swaps.map((s) => (
              <li key={s.entryId}>{s.text}</li>
            ))}
          </ul>
        )}
        <p className="form-note muted">
          Ungefärlig effekt för samma mängd, inom samma sorts livsmedel.
        </p>
      </section>

      <section aria-labelledby="analysis-nutrients-title">
        <h3 className="analysis-title" id="analysis-nutrients-title">
          Näringsinnehåll
        </h3>
        {GROUPS.map((group) => {
          const rows = analysis.rows.filter((r) => r.group === group.id);
          if (rows.length === 0) return null;
          return (
            <table className="analysis-table" key={group.id} data-testid={`nutrients-${group.id}`}>
              <caption>{group.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Ämne</th>
                  <th scope="col">Mängd</th>
                  <th scope="col">
                    <abbr title="av dagsmålet">Mål</abbr>
                  </th>
                  <th scope="col">
                    <abbr title="av referensintaget">RI</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">
                      {r.label}
                      {r.coverage < 0.999 && (
                        <span className="muted" title="Värdet saknas för en del av maten">
                          {' '}
                          *
                        </span>
                      )}
                    </th>
                    <td>{amount(r)}</td>
                    <td>{percent(r.pctGoal)}</td>
                    <td>
                      {percent(r.pctRi)}
                      {r.riSource && <span className="muted"> ({r.riSource})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
        {analysis.rows.every((r) => r.group === 'energi') && (
          <p className="form-note muted">
            Fiber, vitaminer och mineraler finns bara för livsmedel från Livsmedelsverket.
          </p>
        )}
        {partial && (
          <p className="form-note muted">
            * Värdet saknas för en del av {what} (egna livsmedel och streckkodsvaror) – summan är
            för låg.
          </p>
        )}
        <p className="form-note muted">
          Mål = ditt dagsmål för kcal och protein. RI = referensintag för en genomsnittlig vuxen
          (EU); fiber enligt de nordiska näringsrekommendationerna (NNR).
        </p>
      </section>

      <button type="button" className="button" onClick={onAskAi}>
        Fråga AI
      </button>
    </div>
  );
}
