import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Card } from '../components/Card.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { PhotoSessionFlow, type PhotoFlowMode } from '../components/PhotoSessionFlow.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { SessionCompare } from '../components/SessionCompare.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { SessionEditSheet } from '../components/SessionEditSheet.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Toast } from '../components/Toast.tsx';
import {
  deletePhoto,
  putPhoto,
  putPhotoSession,
  setPhotoAngle,
  type PhotoEntry,
  type PhotoSession,
} from '../db/db.ts';
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
import { useUndoToast } from '../lib/useUndoToast.ts';

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
  const toast = useUndoToast();

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

  // Borttagning i helskärmsvyn: direkt, med Ångra (bilden och ett tömt tillfälle kommer tillbaka).
  async function handleDelete(id: string) {
    const index = browseOrder.findIndex((p) => p.id === id);
    const photo = browseOrder[index];
    if (!photo) return;
    const next = browseOrder[index + 1] ?? browseOrder[index - 1];
    const session = sessions?.find((s) => s.id === photo.sessionId);
    await deletePhoto(id);
    setViewingId(next?.id ?? null);
    await reload();
    toast.show(`Tog bort bilden ${labelFor(photo)}.`, async () => {
      if (session) await putPhotoSession(session);
      await putPhoto(toEntry(photo));
      await reload();
    });
  }

  const undoToast = toast.toast && (
    <Toast
      message={toast.toast.message}
      onUndo={toast.onUndo}
      onClose={toast.close}
      testId="photo-toast"
    />
  );

  const loaded = sessions !== null && photos !== null && data !== null;
  // Jämförelsen öppnas från en rad överst i galleriet, i en helskärmspanel.
  const canCompare = rows.length >= 2;
  const startFlow = () => {
    setFlow({ kind: 'new' });
  };

  return (
    <>
      {!loaded && <Skeleton cards={2} />}

      {unassigned.length > 0 && (
        <AngleQueue photos={unassigned} labelFor={labelFor} onSetAngle={handleSetAngle} />
      )}

      {loaded && rows.length === 0 && (
        <EmptyState
          title="Inga bilder än"
          action={{ label: 'Nytt fototillfälle', onClick: startFlow }}
        >
          Här samlas dina progressbilder – framifrån och i profil, gärna med samma ljus och avstånd.
          De lämnar aldrig enheten.
        </EmptyState>
      )}

      {loaded && rows.length > 0 && (
        <Card
          title="Fototillfällen"
          action={
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={startFlow}
            >
              Nytt fototillfälle
            </button>
          }
        >
          <SegmentedControl
            label="Visa bilder"
            options={VIEWS}
            value={view}
            onChange={setView}
            className="gallery-views"
          />
          {(view === 'tillfallen' || canCompare) && (
            <ul className="list">
              {canCompare && (
                <ListRow
                  primary="Jämför tillfällen"
                  secondary="Första mot senaste, sida vid sida eller med reglage"
                  chevron
                  onClick={() => {
                    setComparing(true);
                  }}
                />
              )}
              {view === 'tillfallen' &&
                rows.map((row) => (
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
            </ul>
          )}
          {view !== 'tillfallen' && (
            <AngleGrid
              photos={browseOrder}
              angle={view}
              sessionById={sessionById}
              labelFor={labelFor}
              onView={setViewingId}
            />
          )}
        </Card>
      )}

      {loaded && photos.length > 0 && <StorageCard photos={photos} sessions={rows.length} />}

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
          toast={undoToast}
        />
      )}
      {!viewingId && undoToast}

      {comparing && rows.length >= 2 && (
        <BottomSheet
          title="Jämför tillfällen"
          full
          onClose={() => {
            setComparing(false);
          }}
        >
          <SessionCompare rows={rows} />
        </BottomSheet>
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

/** Bilden som den lagras (utan object URL:en). */
function toEntry(photo: PhotoItem): PhotoEntry {
  const entry: Partial<PhotoItem> = { ...photo };
  delete entry.url;
  return entry as PhotoEntry;
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

/**
 * Ett tillfälle: en `ListRow` (datum, anteckning, vikt – tryck = ändra tillfället) med
 * framifrån och profil i ett rutnät under. Tom vinkel = "Lägg till".
 */
function SessionRowView({ row, labelFor, onView, onEdit, onAdd }: SessionRowViewProps) {
  const { session } = row;
  const date = formatDate(session.date);
  return (
    <ListRow
      testId="photo-session"
      primary={date}
      secondary={session.note}
      value={session.weightKg == null ? 'Ingen vikt' : formatKg(session.weightKg)}
      chevron
      onClick={() => {
        onEdit(session);
      }}
    >
      <ul className="session-photos" aria-label={`Bilder ${date}`}>
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
    </ListRow>
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
    <Card title="Ange vinkel" tone="warning" testId="angle-queue">
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
    </Card>
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
    <Card title="Lagring">
      <ul className="list">
        <ListRow
          primary="Bilder"
          value={
            <span data-testid="photo-storage">
              {formatInt(photos.length)} st · {formatBytes(photoBytes)}
            </span>
          }
        />
        <ListRow
          primary="Tillfällen"
          value={<span data-testid="session-count">{formatInt(sessions)}</span>}
        />
        <ListRow
          primary="Appen använder"
          wrapValue
          value={
            <span data-testid="storage-usage">
              {status == null
                ? 'Kontrollerar…'
                : status.usage == null
                  ? 'Okänt – webbläsaren rapporterar inte lagringen.'
                  : status.quota == null
                    ? formatBytes(status.usage)
                    : `${formatBytes(status.usage)} av ${formatBytes(status.quota)}`}
            </span>
          }
        />
      </ul>
    </Card>
  );
}
