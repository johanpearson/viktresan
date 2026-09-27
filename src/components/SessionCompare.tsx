import { useState } from 'react';
import { formatDate, formatInt, formatKg, formatPhotoLabel } from '../lib/format.ts';
import {
  ANGLE_LABELS,
  CAPTURE_ANGLES,
  compareSessions,
  defaultCompareAngle,
  firstAndLatest,
  photoFor,
  type CaptureAngle,
  type CompareAngle,
  type SessionRow,
} from '../lib/photoSessions.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';
import { ListRow } from './ListRow.tsx';
import { PhotoCompare, type CompareMode } from './PhotoCompare.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';

const COMPARE_MODES: readonly { id: CompareMode; label: string }[] = [
  { id: 'side', label: 'Sida vid sida' },
  { id: 'slider', label: 'Reglage' },
];

const ANGLE_OPTIONS: readonly { id: CompareAngle; label: string }[] = [
  { id: 'fram', label: ANGLE_LABELS.fram },
  { id: 'profil', label: ANGLE_LABELS.profil },
  { id: 'bada', label: 'Båda' },
];

interface SessionCompareProps {
  /** Galleriets rader, nyaste tillfället först. Minst två. */
  rows: readonly SessionRow<PhotoItem>[];
}

/**
 * Jämför två fototillfällen per vinkel (eller båda vinklarna under varandra), med dagar och
 * viktskillnad. Förval: första mot senaste tillfället. Visas i en helskärmspanel (Stäng avslutar).
 */
export function SessionCompare({ rows }: SessionCompareProps) {
  const initial = firstAndLatest(rows);
  const [fromId, setFromId] = useState(initial?.[0].id ?? '');
  const [toId, setToId] = useState(initial?.[1].id ?? '');
  const rowFor = (id: string) => rows.find((r) => r.session.id === id);
  const [angle, setAngle] = useState<CompareAngle>(() =>
    defaultCompareAngle(rowFor(fromId), rowFor(toId)),
  );
  const [mode, setMode] = useState<CompareMode>('side');

  const a = rowFor(fromId);
  const b = rowFor(toId);
  const comparison = a && b && a !== b ? compareSessions(a.session, b.session) : null;
  const before = comparison ? rowFor(comparison.before.id) : undefined;
  const after = comparison ? rowFor(comparison.after.id) : undefined;
  const angles: readonly CaptureAngle[] = angle === 'bada' ? CAPTURE_ANGLES : [angle];
  // Äldst först i valen.
  const options = [...rows].reverse();
  // Snabbvalet behövs bara när man valt något annat än första mot senaste.
  const isFirstAndLatest =
    initial != null &&
    ((fromId === initial[0].id && toId === initial[1].id) ||
      (fromId === initial[1].id && toId === initial[0].id));

  function selectFirstAndLatest() {
    const pair = firstAndLatest(rows);
    if (!pair) return;
    setFromId(pair[0].id);
    setToId(pair[1].id);
  }

  return (
    <section className="compare" aria-label="Jämförelse" data-testid="photo-compare">
      <div className="field-row">
        <label className="field">
          <span className="field-label">Från tillfälle</span>
          <select
            className="input"
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value);
            }}
          >
            {options.map((r) => (
              <option key={r.session.id} value={r.session.id}>
                {formatPhotoLabel(r.session)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Till tillfälle</span>
          <select
            className="input"
            value={toId}
            onChange={(e) => {
              setToId(e.target.value);
            }}
          >
            {options.map((r) => (
              <option key={r.session.id} value={r.session.id}>
                {formatPhotoLabel(r.session)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!isFirstAndLatest && (
        <button
          type="button"
          className="button button-ghost button-small compare-reset"
          onClick={selectFirstAndLatest}
        >
          Första mot senaste
        </button>
      )}

      <SegmentedControl
        label="Vinkel att jämföra"
        options={ANGLE_OPTIONS}
        value={angle}
        onChange={setAngle}
      />

      {!comparison || !before || !after ? (
        <p className="muted" role="status">
          Välj två olika tillfällen att jämföra.
        </p>
      ) : (
        <>
          <ul className="list list-flush">
            <ListRow
              testId="compare-summary"
              primary={`${formatInt(comparison.days)} ${comparison.days === 1 ? 'dag' : 'dagar'} mellan tillfällena`}
              secondary={`${formatDate(comparison.before.date)} → ${formatDate(comparison.after.date)}`}
              value={
                comparison.changeKg == null
                  ? 'Ingen vikt'
                  : formatKg(comparison.changeKg, { signed: true })
              }
            />
          </ul>
          <SegmentedControl
            label="Jämförelsevy"
            options={COMPARE_MODES}
            value={mode}
            onChange={setMode}
          />
          {angles.map((current) => {
            const beforePhoto = photoFor(before, current);
            const afterPhoto = photoFor(after, current);
            const name = ANGLE_LABELS[current].toLowerCase();
            const missing = [
              ...(beforePhoto ? [] : [comparison.before]),
              ...(afterPhoto ? [] : [comparison.after]),
            ];
            return (
              <div key={current} className="compare-angle" data-testid={`compare-${current}`}>
                {angle === 'bada' && (
                  <h3 className="compare-angle-title">{ANGLE_LABELS[current]}</h3>
                )}
                {beforePhoto && afterPhoto ? (
                  <PhotoCompare
                    key={`${beforePhoto.id}-${afterPhoto.id}`}
                    before={beforePhoto}
                    after={afterPhoto}
                    beforeLabel={formatPhotoLabel(comparison.before)}
                    afterLabel={formatPhotoLabel(comparison.after)}
                    mode={mode}
                    {...(angle === 'bada' ? { name } : {})}
                  />
                ) : (
                  <p className="muted compare-missing">
                    {missing.length === 2
                      ? `Inget av tillfällena har en bild ${name === 'profil' ? 'i profil' : name}.`
                      : `Tillfället ${formatDate(missing[0]?.date ?? '')} saknar bild ${
                          name === 'profil' ? 'i profil' : name
                        }.`}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
