import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../components/Page.tsx';
import { PhotoSessionFlow, type PhotoFlowMode } from '../components/PhotoSessionFlow.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { SessionCompare } from '../components/SessionCompare.tsx';
import { SessionEditSheet } from '../components/SessionEditSheet.tsx';
import { deletePhoto, setPhotoAngle, type PhotoSession } from '../db/db.ts';
import { formatDate, formatInt, formatKg, formatPhotoLabel } from '../lib/format.ts';
import {
  ANGLE_LABELS,
  CAPTURE_ANGLES,
  angleText,
  ensureSessions,
  photosWithAngle,
  sessionRows,
  type CaptureAngle,
  type SessionRow,
} from '../lib/photoSessions.ts';
import { usePreferences } from '../lib/preferences.ts';
import { formatBytes, getStorageStatus, type StorageStatus } from '../lib/storage.ts';
import { useAppData } from '../lib/useAppData.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { usePhotos, type PhotoItem } from '../lib/usePhotos.ts';

type GalleryView = 'tillfallen' | CaptureAngle;

const VIEWS: readonly { id: GalleryView; label: string }[] = [
  { id: 'tillfallen', label: 'Tillfällen' },
  { id: 'fram', label: ANGLE_LABELS.fram },
  { id: 'profil', label: ANGLE_LABELS.profil },
];

/** Framsteg → Bilder: fototillfällen, galleri per tillfälle eller vinkel, och jämförelse. */
export function Bilder() {
  const { data } = useAppData();
  const { sessions, photos, reload } = usePhotos();
  const { prefs } = usePreferences();
  const [view, setView] = useState<GalleryView>('tillfallen');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [flow, setFlow] = useState<PhotoFlowMode | null>(null);
  const [editing, setEditing] = useState<PhotoSession | null>(null);
  // "#/framsteg/bilder/jamfor" (från milstolpen) öppnar jämförelsen: första mot senaste.
  const { sub } = useHashRoute();
  const [comparing, setComparing] = useState(sub === 'bilder/jamfor');

  const rows = useMemo(() => sessionRows(sessions ?? [], photos ?? []), [sessions, photos]);
  const sessionById = useMemo(
    () => new Map(ensureSessions(sessions ?? [], photos ?? []).map((s) => [s.id, s])),
    [sessions, photos],
  );
  const unassigned = useMemo(() => photosWithAngle(photos ?? [], 'okand'), [photos]);
  // Ordningen man bläddrar i helskärmsvyn: som galleriet visar bilderna.
  const browseOrder = useMemo(
    () =>
      view === 'tillfallen'
        ? rows.flatMap((r) => [...r.fram, ...r.profil, ...r.okand])
        : photosWithAngle(photos ?? [], view),
    [rows, photos, view],
  );

  function labelFor(photo: PhotoItem): string {
    const session = sessionById.get(photo.sessionId) ?? { date: photo.date };
    return `${formatPhotoLabel(session)} · ${angleText(photo)}`;
  }

  async function handleSetAngle(id: string, angle: CaptureAngle) {
    await setPhotoAngle(id, angle, prefs.profileSide);
    // Filtret visar en annan vinkel: bilden försvinner ur listan man bläddrar i.
    if (view !== 'tillfallen' && view !== angle) setViewingId(null);
    await reload();
  }

  async function handleDelete(id: string) {
    const index = browseOrder.findIndex((p) => p.id === id);
    const next = browseOrder[index + 1] ?? browseOrder[index - 1];
    await deletePhoto(id);
    setViewingId(next?.id ?? null);
    await reload();
  }

  const loaded = sessions !== null && photos !== null;

  return (
    <>
      <section className="card" aria-labelledby="sessions-title">
        <h2 className="card-title" id="sessions-title">
          Fototillfällen
        </h2>
        <p className="form-note">
          Ta bilder framifrån och i profil vid varje tillfälle, gärna med samma ljus och avstånd.
          Bilderna lämnar aldrig enheten.
        </p>
        <button
          type="button"
          className="button session-new"
          disabled={!data}
          onClick={() => {
            setFlow({ kind: 'new' });
          }}
        >
          Nytt fototillfälle
        </button>
      </section>

      {unassigned.length > 0 && (
        <AngleQueue photos={unassigned} labelFor={labelFor} onSetAngle={handleSetAngle} />
      )}

      {comparing && rows.length >= 2 && (
        <SessionCompare
          rows={rows}
          onClose={() => {
            setComparing(false);
          }}
        />
      )}

      {loaded && rows.length === 0 && (
        <EmptyState>Här samlas dina progressbilder. De lämnar aldrig enheten.</EmptyState>
      )}

      {rows.length > 0 && (
        <section className="card" aria-labelledby="gallery-title">
          <div className="card-header">
            <h2 className="card-title" id="gallery-title">
              Galleri
            </h2>
            {rows.length >= 2 && (
              <button
                type="button"
                className="button button-secondary button-small"
                aria-pressed={comparing}
                onClick={() => {
                  setComparing((c) => !c);
                }}
              >
                {comparing ? 'Stäng jämförelse' : 'Jämför'}
              </button>
            )}
          </div>
          <div className="segmented gallery-views" role="group" aria-label="Visa bilder">
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="segmented-button"
                aria-pressed={option.id === view}
                onClick={() => {
                  setView(option.id);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {view === 'tillfallen' ? (
            <ol className="session-list">
              {rows.map((row) => (
                <SessionRowView
                  key={row.session.id}
                  row={row}
                  labelFor={labelFor}
                  onView={setViewingId}
                  onEdit={setEditing}
                  onAdd={(session, angle) => {
                    setFlow({ kind: 'add', session, angle });
                  }}
                />
              ))}
            </ol>
          ) : (
            <AngleGrid
              photos={browseOrder}
              angle={view}
              sessionById={sessionById}
              labelFor={labelFor}
              onView={setViewingId}
            />
          )}
        </section>
      )}

      {photos && <StorageCard photos={photos} sessions={rows.length} />}

      {viewingId && (
        <PhotoViewer
          photos={browseOrder}
          photoId={viewingId}
          labelFor={labelFor}
          onNavigate={setViewingId}
          onSetAngle={handleSetAngle}
          onDelete={handleDelete}
          onClose={() => {
            setViewingId(null);
          }}
        />
      )}

      {flow && data && photos && (
        <PhotoSessionFlow
          mode={flow}
          weights={data.weights}
          photos={photos}
          onChanged={reload}
          onClose={() => {
            setFlow(null);
          }}
        />
      )}

      {editing && (
        <SessionEditSheet
          session={editing}
          onChanged={reload}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

interface ThumbProps {
  photo: PhotoItem;
  label: string;
  caption: string;
  onView: (id: string) => void;
}

function Thumb({ photo, label, caption, onView }: ThumbProps) {
  return (
    <button
      type="button"
      className="photo-thumb"
      data-testid="photo"
      data-angle={photo.angle}
      aria-label={`Visa bild ${label}`}
      onClick={() => {
        onView(photo.id);
      }}
    >
      <img src={photo.url} alt="" loading="lazy" decoding="async" />
      <span className="photo-date" aria-hidden="true">
        {caption}
      </span>
    </button>
  );
}

interface SessionRowViewProps {
  row: SessionRow<PhotoItem>;
  labelFor: (photo: PhotoItem) => string;
  onView: (id: string) => void;
  onEdit: (session: PhotoSession) => void;
  onAdd: (session: PhotoSession, angle: CaptureAngle) => void;
}

/** Ett tillfälle: datum och vikt ovanför, framifrån och profil sida vid sida. */
function SessionRowView({ row, labelFor, onView, onEdit, onAdd }: SessionRowViewProps) {
  const { session } = row;
  const date = formatDate(session.date);
  return (
    <li className="session-row" data-testid="photo-session" aria-label={`Tillfället ${date}`}>
      <div className="session-head">
        <h3 className="session-date">{date}</h3>
        <span className="session-weight">
          {session.weightKg == null ? 'Ingen vikt' : formatKg(session.weightKg)}
        </span>
        <button
          type="button"
          className="button button-secondary button-small"
          aria-label={`Ändra tillfället ${date}`}
          onClick={() => {
            onEdit(session);
          }}
        >
          Ändra
        </button>
      </div>
      {session.note && <p className="session-note">{session.note}</p>}
      <ul className="session-photos">
        {CAPTURE_ANGLES.flatMap((angle) =>
          row[angle].length > 0
            ? row[angle].map((photo) => (
                <li key={photo.id}>
                  <Thumb
                    photo={photo}
                    label={labelFor(photo)}
                    caption={angleText(photo)}
                    onView={onView}
                  />
                </li>
              ))
            : [
                <li key={angle}>
                  <button
                    type="button"
                    className="photo-slot"
                    aria-label={`Lägg till bild ${ANGLE_LABELS[angle].toLowerCase()} för ${date}`}
                    onClick={() => {
                      onAdd(session, angle);
                    }}
                  >
                    <span aria-hidden="true">+</span>
                    {ANGLE_LABELS[angle]}
                  </button>
                </li>,
              ],
        )}
        {row.okand.map((photo) => (
          <li key={photo.id}>
            <Thumb photo={photo} label={labelFor(photo)} caption="Vinkel saknas" onView={onView} />
          </li>
        ))}
      </ul>
    </li>
  );
}

interface AngleGridProps {
  photos: readonly PhotoItem[];
  angle: CaptureAngle;
  sessionById: ReadonlyMap<string, PhotoSession>;
  labelFor: (photo: PhotoItem) => string;
  onView: (id: string) => void;
}

/** Bara en vinkel, i rutnät över tid (nyast först). */
function AngleGrid({ photos, angle, sessionById, labelFor, onView }: AngleGridProps) {
  if (photos.length === 0) {
    return (
      <p className="muted" role="status">
        Inga bilder {angle === 'fram' ? 'framifrån' : 'i profil'} än.
      </p>
    );
  }
  return (
    <ul className="photo-grid">
      {photos.map((photo) => {
        const session = sessionById.get(photo.sessionId);
        return (
          <li key={photo.id}>
            <Thumb
              photo={photo}
              label={labelFor(photo)}
              caption={formatPhotoLabel(session ?? { date: photo.date })}
              onView={onView}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface AngleQueueProps {
  photos: readonly PhotoItem[];
  labelFor: (photo: PhotoItem) => string;
  onSetAngle: (id: string, angle: CaptureAngle) => Promise<void>;
}

/** Uppmaning att ange vinkel på migrerade bilder, med snabbval direkt på bilden. */
function AngleQueue({ photos, labelFor, onSetAngle }: AngleQueueProps) {
  return (
    <section className="card" aria-labelledby="angle-queue-title" data-testid="angle-queue">
      <h2 className="card-title" id="angle-queue-title">
        Ange vinkel
      </h2>
      <p className="form-note">
        {photos.length === 1 ? '1 bild saknar' : `${formatInt(photos.length)} bilder saknar`}{' '}
        vinkel. Välj Framifrån eller Profil på bilden så går den att jämföra per vinkel.
      </p>
      <ul className="angle-queue">
        {photos.map((photo) => {
          const date = formatDate(photo.date);
          return (
            <li key={photo.id} className="angle-item" data-testid="unassigned-photo">
              <img src={photo.url} alt={`Bild utan vinkel ${labelFor(photo)}`} loading="lazy" />
              <span className="photo-date">{date}</span>
              <div className="angle-picks">
                {CAPTURE_ANGLES.map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    className="angle-pick"
                    aria-label={`${ANGLE_LABELS[angle]}: bilden ${date}`}
                    onClick={() => void onSetAngle(photo.id, angle)}
                  >
                    {ANGLE_LABELS[angle]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StorageCard({ photos, sessions }: { photos: readonly PhotoItem[]; sessions: number }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const photoBytes = photos.reduce((sum, p) => sum + p.blob.size, 0);

  // Läs om uppskattningen när bilderna ändras.
  useEffect(() => {
    let active = true;
    void getStorageStatus().then((result) => {
      if (active) setStatus(result);
    });
    return () => {
      active = false;
    };
  }, [photos]);

  return (
    <section className="card" aria-labelledby="storage-title">
      <h2 className="card-title" id="storage-title">
        Lagring
      </h2>
      <dl className="kv">
        <dt>Bilder</dt>
        <dd data-testid="photo-storage">
          {photos.length} st · {formatBytes(photoBytes)}
        </dd>
        <dt>Tillfällen</dt>
        <dd data-testid="session-count">{formatInt(sessions)}</dd>
        <dt>Appen använder</dt>
        <dd data-testid="storage-usage">
          {status == null
            ? 'Kontrollerar…'
            : status.usage == null
              ? 'Okänt – webbläsaren rapporterar inte lagringen.'
              : status.quota == null
                ? formatBytes(status.usage)
                : `${formatBytes(status.usage)} av ${formatBytes(status.quota)}`}
        </dd>
      </dl>
    </section>
  );
}
