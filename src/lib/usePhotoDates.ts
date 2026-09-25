import { useEffect, useState } from 'react';
import { listPhotoDates } from '../db/db.ts';

/** Datum för alla bilder (en post per bild). Tom lista tills läsningen är klar. */
export function usePhotoDates(): string[] {
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void listPhotoDates()
      .catch(() => [])
      .then((result) => {
        if (active) setDates(result);
      });
    return () => {
      active = false;
    };
  }, []);

  return dates;
}
