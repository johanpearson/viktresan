import { useState, type SyntheticEvent } from 'react';
import { putPhotoSession, type PhotoSession } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import { parsePhotoFields } from '../lib/validation.ts';
import { BottomSheet } from './BottomSheet.tsx';

interface SessionEditSheetProps {
  session: PhotoSession;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/** Ändra datum, vikt och anteckning för ett fototillfälle (Redigera i detaljvyn). */
export function SessionEditSheet({ session, onChanged, onClose }: SessionEditSheetProps) {
  const [date, setDate] = useState(session.date);
  const [weight, setWeight] = useState(
    session.weightKg == null ? '' : session.weightKg.toFixed(1).replace('.', ','),
  );
  const [note, setNote] = useState(session.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave(event: SyntheticEvent) {
    event.preventDefault();
    const fields = parsePhotoFields({ date, weight, note });
    if (!fields.ok) {
      setError(fields.error);
      return;
    }
    setBusy(true);
    try {
      await putPhotoSession({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        ...fields.value,
      });
      await onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet title={`Tillfället ${formatDate(session.date)}`} onClose={onClose}>
      <form className="form" onSubmit={(e) => void handleSave(e)} noValidate>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Datum</span>
            <input
              className="input"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Vikt (kg, valfri)</span>
            <input
              className="input"
              inputMode="decimal"
              autoComplete="off"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
              }}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Anteckning (valfri)</span>
          <textarea
            className="input textarea"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button" disabled={busy}>
            Spara
          </button>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Avbryt
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
