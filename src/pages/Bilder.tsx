import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { EmptyState, Page } from '../components/Page.tsx';
import { PhotoCompare } from '../components/PhotoCompare.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { deletePhoto, newId, putPhoto, type WeightEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatPhotoLabel } from '../lib/format.ts';
import { compressImage } from '../lib/image.ts';
import { dailyWeights } from '../lib/stats.ts';
import { formatBytes, getStorageStatus, type StorageStatus } from '../lib/storage.ts';
import { useAppData } from '../lib/useAppData.ts';
import { usePhotos, type PhotoItem } from '../lib/usePhotos.ts';
import { parsePhotoFields } from '../lib/validation.ts';

/** Dagens medelvikt som förifyllt värde, eller tomt om dagen saknar mätning. */
function weightTextFor(date: string, weights: readonly WeightEntry[]): string {
  const day = dailyWeights(weights).find((d) => d.date === date);
  return day ? day.weightKg.toFixed(1).replace('.', ',') : '';
}

export function Bilder() {
  const { data } = useAppData();
  const { photos, reload } = usePhotos();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const newestFirst = useMemo(() => [...(photos ?? [])].reverse(), [photos]);
  const compared = useMemo(() => {
    if (selected.length !== 2) return null;
    // `photos` är sorterad äldst först, så den som kommer först är "före".
    const pair = (photos ?? []).filter((p) => selected.includes(p.id));
    const [before, after] = pair;
    return before && after ? { before, after } : null;
  }, [photos, selected]);

  function handleThumbnail(photo: PhotoItem) {
    if (!comparing) {
      setViewingId(photo.id);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(photo.id)) return prev.filter((id) => id !== photo.id);
      // Högst två: en ny markering ersätter den senast valda.
      return prev.length < 2 ? [...prev, photo.id] : [prev[0] ?? photo.id, photo.id];
    });
  }

  async function handleDelete(id: string) {
    const index = newestFirst.findIndex((p) => p.id === id);
    const next = newestFirst[index + 1] ?? newestFirst[index - 1];
    await deletePhoto(id);
    setSelected((prev) => prev.filter((s) => s !== id));
    setViewingId(next?.id ?? null);
    await reload();
  }

  function stopComparing() {
    setComparing(false);
    setSelected([]);
  }

  return (
    <Page title="Bilder">
      {data && <AddPhoto weights={data.weights} onAdded={reload} />}

      {compared && (
        <PhotoCompare before={compared.before} after={compared.after} onClose={stopComparing} />
      )}

      {photos && photos.length === 0 && (
        <EmptyState>Här samlas dina progressbilder. De lämnar aldrig enheten.</EmptyState>
      )}

      {photos && photos.length > 0 && (
        <section className="card" aria-labelledby="gallery-title">
          <div className="card-header">
            <h2 className="card-title" id="gallery-title">
              Galleri
            </h2>
            {photos.length >= 2 && (
              <button
                type="button"
                className="button button-secondary button-small"
                aria-pressed={comparing}
                onClick={() => {
                  if (comparing) stopComparing();
                  else setComparing(true);
                }}
              >
                {comparing ? 'Klar' : 'Jämför'}
              </button>
            )}
          </div>
          {comparing && (
            <p className="muted gallery-hint" role="status">
              {selected.length < 2
                ? `Välj ${selected.length === 0 ? 'två bilder' : 'en bild till'} att jämföra.`
                : 'Jämförelsen visas ovanför galleriet.'}
            </p>
          )}
          <ul className="photo-grid">
            {newestFirst.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  className="photo-thumb"
                  data-testid="photo"
                  aria-label={
                    comparing
                      ? `Välj bild ${formatPhotoLabel(photo)}`
                      : `Visa bild ${formatPhotoLabel(photo)}`
                  }
                  aria-pressed={comparing ? selected.includes(photo.id) : undefined}
                  onClick={() => {
                    handleThumbnail(photo);
                  }}
                >
                  <img src={photo.url} alt="" loading="lazy" decoding="async" />
                  <span className="photo-date" aria-hidden="true">
                    {formatDate(photo.date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {photos && <StorageCard photos={photos} />}

      {viewingId && (
        <PhotoViewer
          photos={newestFirst}
          photoId={viewingId}
          onNavigate={setViewingId}
          onDelete={handleDelete}
          onClose={() => {
            setViewingId(null);
          }}
        />
      )}
    </Page>
  );
}

interface AddPhotoProps {
  weights: readonly WeightEntry[];
  onAdded: () => Promise<void>;
}

function AddPhoto({ weights, onAdded }: AddPhotoProps) {
  const [date, setDate] = useState(todayIso);
  const [weight, setWeight] = useState(() => weightTextFor(todayIso(), weights));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Tillåt att samma fil väljs igen.
    input.value = '';
    if (!file) return;
    const fields = parsePhotoFields({ date, weight });
    if (!fields.ok) {
      setError(fields.error);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const image = await compressImage(file);
      await putPhoto({
        id: newId(),
        createdAt: Date.now(),
        blob: image.blob,
        mimeType: image.blob.type,
        width: image.width,
        height: image.height,
        ...fields.value,
      });
      await onAdded();
      setStatus(`Bilden är sparad (${formatBytes(image.blob.size)}).`);
    } catch {
      setError('Kunde inte läsa bilden. Prova en JPEG-, PNG- eller WebP-bild.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form">
      <h2 className="card-title">Ny bild</h2>
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
              setWeight(weightTextFor(e.target.value, weights));
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
      <div className="button-row">
        <label className="button file-button" aria-disabled={busy}>
          Ta foto
          <input
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => void handleFile(e)}
          />
        </label>
        <label className="button button-secondary file-button" aria-disabled={busy}>
          Välj från galleriet
          <input
            className="file-input"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => void handleFile(e)}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-ok" role="status">
        {busy ? 'Komprimerar bilden…' : status}
      </p>
      <p className="muted form-note">
        Bilden förminskas till max 1080 px och sparas utan plats- och kamerainformation (EXIF).
      </p>
    </div>
  );
}

function StorageCard({ photos }: { photos: readonly PhotoItem[] }) {
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
