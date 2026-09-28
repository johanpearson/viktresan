import { useMemo, useState } from 'react';
import { aiContextFrom } from '../lib/aiPrompt.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatShortDate } from '../lib/format.ts';
import {
  PLATEAU_NOISE_NOTE,
  analyzePlateau,
  comparisonRows,
  detectPlateau,
  plateauHeadline,
  plateauPromptLines,
  shouldShowPlateau,
} from '../lib/plateau.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import type { AppData } from '../lib/useAppData.ts';
import { AskAi } from './AskAi.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { Card } from './Card.tsx';

interface PlateauCardProps {
  data: AppData;
  now: Date;
}

/** Så många förklaringar lyfts fram. */
const MAX_EXPLANATIONS = 2;

/**
 * Översikt: trendvikten har stått still i tre veckor. Saklig jämförelse av de senaste
 * tre veckorna mot de tre innan, de mest sannolika förklaringarna och "Fråga AI om
 * platån". Kan stängas; visas igen tidigast efter 14 dagar (om platån håller i sig).
 */
export function PlateauCard({ data, now }: PlateauCardProps) {
  const { loaded, prefs } = usePreferences();
  const features = useFeatures();
  const [asking, setAsking] = useState(false);
  const today = todayIso(now);
  const check = useMemo(
    () => detectPlateau({ profile: data.profile, weights: data.weights, today }),
    [data.profile, data.weights, today],
  );
  const analysis = useMemo(
    () => (check.kind === 'plateau' ? analyzePlateau(data, today) : null),
    [check.kind, data, today],
  );
  if (!loaded || check.kind !== 'plateau' || !analysis) return null;
  if (!shouldShowPlateau(check, prefs.plateauDismissed, today)) return null;

  const rows = features.filter(comparisonRows(analysis));
  const explanations = features.filter(analysis.explanations).slice(0, MAX_EXPLANATIONS);
  const { recent, previous } = analysis;

  return (
    <>
      <Card
        title="Trendvikten står still"
        tone="info"
        testId="plateau-card"
        action={
          <button
            type="button"
            className="button button-ghost button-small"
            aria-label="Stäng platåkortet"
            onClick={() => void setPreference('plateauDismissed', today)}
          >
            Stäng
          </button>
        }
      >
        <p className="plateau-lead">{plateauHeadline(check)}</p>
        <table className="table" data-testid="plateau-comparison">
          <caption className="visually-hidden">
            Senaste tre veckorna jämfört med de tre veckorna innan
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Uppgift</span>
              </th>
              <th scope="col" className="num">
                {formatShortDate(recent.from)}–{formatShortDate(recent.to)}
              </th>
              <th scope="col" className="num">
                {formatShortDate(previous.from)}–{formatShortDate(previous.to)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="plateau-row" data-id={r.id}>
                <th scope="row">{r.label}</th>
                <td className="num">{r.recent}</td>
                <td className="num">{r.previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {analysis.doseChanges.length > 0 && (
          <p className="form-note muted" data-testid="plateau-dose-changes">
            Dosbyte: {analysis.doseChanges.map((c) => c.text).join('; ')}
          </p>
        )}
        <h3 className="plateau-subtitle">
          {explanations.length > 0 ? 'Det här kan förklara platån' : 'Inga tydliga skillnader'}
        </h3>
        {explanations.length > 0 ? (
          <ul className="plateau-reasons" data-testid="plateau-reasons">
            {explanations.map((e) => (
              <li key={e.id} data-id={e.id}>
                {e.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="plateau-reasons" data-testid="plateau-reasons">
            Det du loggat skiljer sig inte tydligt mellan perioderna.
          </p>
        )}
        <p className="form-note muted">{PLATEAU_NOISE_NOTE}</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setAsking(true);
          }}
        >
          Fråga AI om platån
        </button>
      </Card>
      {asking && (
        <BottomSheet
          full
          title="Fråga AI om platån"
          onClose={() => {
            setAsking(false);
          }}
        >
          <AskAi
            subject={{
              kind: 'plateau',
              lines: plateauPromptLines(check, analysis, rows, explanations),
            }}
            context={aiContextFrom(data, today)}
          />
        </BottomSheet>
      )}
    </>
  );
}
