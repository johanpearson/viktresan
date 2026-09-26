import { useCallback, useEffect, useState } from 'react';
import { listPhotoSessions, listPhotos, type PhotoEntry, type PhotoSession } from '../db/db.ts';

/** En sparad bild med en object URL att visa den med. */
export interface PhotoItem extends PhotoEntry {
  url: string;
}

export interface PhotoLibrary {
  sessions: PhotoSession[];
  photos: PhotoItem[];
}

function revokeAll(library: PhotoLibrary | null): void {
  for (const photo of library?.photos ?? []) URL.revokeObjectURL(photo.url);
}

/**
 * Läser fototillfällena och bilderna ur IndexedDB (äldst först) och skapar object URLs
 * för bilderna. URL:erna frigörs när listan ersätts eller komponenten avmonteras.
 */
export function usePhotos(): {
  sessions: PhotoSession[] | null;
  photos: PhotoItem[] | null;
  reload: () => Promise<void>;
} {
  const [library, setLibrary] = useState<PhotoLibrary | null>(null);

  const load = useCallback(async (): Promise<PhotoLibrary> => {
    try {
      const [sessions, entries] = await Promise.all([listPhotoSessions(), listPhotos()]);
      return {
        sessions,
        photos: entries.map((entry) => ({ ...entry, url: URL.createObjectURL(entry.blob) })),
      };
    } catch {
      return { sessions: [], photos: [] };
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setLibrary(result);
      else revokeAll(result);
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(
    () => () => {
      revokeAll(library);
    },
    [library],
  );

  const reload = useCallback(async () => {
    setLibrary(await load());
  }, [load]);

  return { sessions: library?.sessions ?? null, photos: library?.photos ?? null, reload };
}
