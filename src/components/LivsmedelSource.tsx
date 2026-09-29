import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format.ts';
import { loadLivsmedel, type FoodDatabaseInfo, type Livsmedel } from '../lib/livsmedel.ts';

/** "Fineli, … (THL), version 18.0 (CC BY 4.0, hämtad 29 sep. 2026)" */
function databaseText(db: FoodDatabaseInfo): string {
  const version = db.version ? `, version ${db.version}` : '';
  const retrieved = db.retrieved ? `, hämtad ${formatDate(db.retrieved)}` : '';
  return `${db.source}${version} (${db.license}${retrieved})`;
}

function sourceText(livsmedel: Livsmedel | null): string {
  if (livsmedel === null) return 'Laddar livsmedelsdatabaserna …';
  const databases = livsmedel.databases ?? [];
  if (livsmedel.foods.length === 0 || databases.length === 0) {
    return 'Livsmedelsdatabaserna ingår inte i den här versionen. Egna livsmedel, måltider och streckkoder fungerar.';
  }
  const texts = databases.map(databaseText);
  const last = texts.pop() ?? '';
  return `Näringsvärden i Mat: ${texts.length > 0 ? `${texts.join(', ')} och ${last}` : last}.`;
}

/** Inställningar → Om appen: källorna för näringsvärdena (krävs av CC BY 4.0). */
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
    <p className="form-note muted" data-testid="livsmedel-source">
      {sourceText(livsmedel)}
    </p>
  );
}
