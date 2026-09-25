import { useCallback, useEffect, useState } from 'react';
import { listPhotos, type PhotoEntry } from '../db/db.ts';

/** En sparad bild med en object URL att visa den med. */
export interface PhotoItem extends PhotoEntry {
  url: string;
}

function revokeAll(photos: readonly PhotoItem[] | null): void {
  for (const photo of photos ?? []) URL.revokeObjectURL(photo.url);
}

/**
 * Läser bilderna ur IndexedDB (äldst först) och skapar object URLs för dem.
 * URL:erna frigörs när listan ersätts eller komponenten avmonteras.
 */
export function usePhotos(): { photos: PhotoItem[] | null; reload: () => Promise<void> } {
  const [photos, setPhotos] = useState<PhotoItem[] | null>(null);

  const load = useCallback(async (): Promise<PhotoItem[]> => {
    try {
      const entries = await listPhotos();
      return entries.map((entry) => ({ ...entry, url: URL.createObjectURL(entry.blob) }));
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setPhotos(result);
      else revokeAll(result);
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(
    () => () => {
      revokeAll(photos);
    },
    [photos],
  );

  const reload = useCallback(async () => {
    setPhotos(await load());
  }, [load]);

  return { photos, reload };
}
