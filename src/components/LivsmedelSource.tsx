import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format.ts';
import { loadLivsmedel, type Livsmedel } from '../lib/livsmedel.ts';

function sourceText(livsmedel: Livsmedel | null): string {
  if (livsmedel === null) return 'Laddar livsmedelsdatabasen …';
  if (livsmedel.foods.length === 0) {
    return 'Livsmedelsverkets databas ingår inte i den här versionen. Egna livsmedel, måltider och streckkoder fungerar.';
  }
  const retrieved = livsmedel.retrieved ? `, hämtad ${formatDate(livsmedel.retrieved)}` : '';
  return `Näringsvärden i Mat: ${livsmedel.source} (${livsmedel.license}${retrieved}).`;
}

/** Inställningar → Om appen: källan för näringsvärdena (krävs av CC BY 4.0). */
export function LivsmedelSource() {
  const [livsmedel, setLivsmedel] = useState<Livsmedel | null>(null);

  useEffect(() => {
    let active = true;
    void loadLivsmedel().then((result) => {
      if (active) setLivsmedel(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <p className="form-note muted about-source" data-testid="livsmedel-source">
      {sourceText(livsmedel)}
    </p>
  );
}
