import { describe, expect, it } from 'vitest';
import type { PhotoEntry, PhotoSession } from '../db/db.ts';
import {
  angleText,
  compareSessions,
  defaultCompareAngle,
  ensureSessions,
  firstAndLatest,
  photoFor,
  photosWithAngle,
  pickGhost,
  sessionRows,
  trendWeightOn,
  trendWeightText,
} from './photoSessions.ts';

const blob = new Blob(['x'], { type: 'image/webp' });

function photo(
  id: string,
  sessionId: string,
  date: string,
  angle: PhotoEntry['angle'],
  createdAt: number,
  extra: Partial<PhotoEntry> = {},
): PhotoEntry {
  return { id, sessionId, date, angle, blob, mimeType: 'image/webp', createdAt, ...extra };
}

const sessions: PhotoSession[] = [
  { id: 's1', date: '2026-01-01', weightKg: 92, createdAt: 1 },
  { id: 's2', date: '2026-02-01', createdAt: 2 },
  { id: 's3', date: '2026-03-01', weightKg: 88.4, createdAt: 3 },
  // Tomt tillfälle (alla bilder borttagna utanför appen) visas inte.
  { id: 'tom', date: '2026-04-01', createdAt: 4 },
];

const photos: PhotoEntry[] = [
  photo('f1', 's1', '2026-01-01', 'fram', 10),
  photo('p1', 's1', '2026-01-01', 'profil', 11, { side: 'vanster' }),
  photo('u2', 's2', '2026-02-01', 'okand', 20),
  photo('f3a', 's3', '2026-03-01', 'fram', 30),
  photo('f3b', 's3', '2026-03-01', 'fram', 31),
  photo('p3', 's3', '2026-03-01', 'profil', 32, { side: 'hoger' }),
];

describe('sessionRows', () => {
  it('grupperar per tillfälle och vinkel, nyaste tillfället och bilden först', () => {
    const rows = sessionRows(sessions, photos);
    expect(rows.map((r) => r.session.id)).toEqual(['s3', 's2', 's1']);
    const [s3, s2, s1] = rows;
    expect(s3?.fram.map((p) => p.id)).toEqual(['f3b', 'f3a']);
    expect(s3?.profil.map((p) => p.id)).toEqual(['p3']);
    expect(s2?.okand.map((p) => p.id)).toEqual(['u2']);
    expect(s2?.fram).toEqual([]);
    expect(s1 && photoFor(s1, 'fram')?.id).toBe('f1');
    expect(s3 && photoFor(s3, 'fram')?.id).toBe('f3b');
    expect(s2 && photoFor(s2, 'profil')).toBeNull();
  });

  it('bilder vars tillfälle saknas får ett ersättningstillfälle från bildens datum', () => {
    const rows = sessionRows([], [photo('x', 'borta', '2026-05-05', 'fram', 1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.session).toEqual({ id: 'borta', date: '2026-05-05', createdAt: 1 });
    expect(ensureSessions(sessions, photos)).toHaveLength(sessions.length);
  });

  it('filtrerar en vinkel över tid', () => {
    expect(photosWithAngle(photos, 'fram').map((p) => p.id)).toEqual(['f3b', 'f3a', 'f1']);
    expect(photosWithAngle(photos, 'okand').map((p) => p.id)).toEqual(['u2']);
  });

  it('första mot senaste och förvald vinkel', () => {
    const rows = sessionRows(sessions, photos);
    expect(firstAndLatest(rows)?.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(firstAndLatest(rows.slice(0, 1))).toBeNull();
    expect(defaultCompareAngle(rows[2], rows[0])).toBe('fram');
    // s2 har bara en bild utan vinkel: ingen gemensam vinkel → båda.
    expect(defaultCompareAngle(rows[1], rows[0])).toBe('bada');
  });
});

describe('pickGhost', () => {
  it('senaste bilden i samma vinkel', () => {
    expect(pickGhost(photos, 'fram', 'vanster')?.id).toBe('f3b');
  });

  it('hoppar över det pågående tillfället', () => {
    expect(pickGhost(photos, 'fram', 'vanster', 's3')?.id).toBe('f1');
  });

  it('profil: samma sida går före en nyare bild från andra sidan', () => {
    expect(pickGhost(photos, 'profil', 'vanster')?.id).toBe('p1');
    expect(pickGhost(photos, 'profil', 'hoger')?.id).toBe('p3');
    // Finns bara andra sidan duger den.
    expect(pickGhost(photos, 'profil', 'hoger', 's3')?.id).toBe('p1');
  });

  it('bilder utan vinkel används aldrig; inget att visa ger null', () => {
    expect(pickGhost([photo('u', 's', '2026-01-01', 'okand', 1)], 'fram', 'vanster')).toBeNull();
    expect(pickGhost([], 'profil', 'hoger')).toBeNull();
  });
});

describe('trendWeightOn', () => {
  const weights = [
    { date: '2026-01-01', weightKg: 90 },
    { date: '2026-01-02', weightKg: 91 },
    { date: '2026-01-10', weightKg: 89 },
  ];

  it('trendvikten (EMA) den dagen, avrundad', () => {
    expect(trendWeightOn(weights, '2026-01-01')).toBe(90);
    expect(trendWeightOn(weights, '2026-01-02')).toBe(90.1);
    expect(trendWeightText(weights, '2026-01-02')).toBe('90,1');
  });

  it('räknar bara med vägningar t.o.m. dagen', () => {
    expect(trendWeightOn(weights, '2026-01-05')).toBe(90.1);
  });

  it('ingen vägning inom en vecka före → tomt', () => {
    expect(trendWeightOn(weights, '2025-12-31')).toBeNull();
    expect(trendWeightOn(weights, '2026-01-18')).toBeNull();
    expect(trendWeightText(weights, '2026-01-18')).toBe('');
    expect(trendWeightOn([], '2026-01-01')).toBeNull();
  });
});

describe('compareSessions', () => {
  it('ordnar äldst först och räknar dagar och viktskillnad', () => {
    const [s1, s2, s3] = sessions;
    if (!s1 || !s2 || !s3) throw new Error('testdata');
    expect(compareSessions(s3, s1)).toEqual({ before: s1, after: s3, days: 59, changeKg: -3.6 });
    expect(compareSessions(s1, s2).changeKg).toBeNull();
  });
});

describe('angleText', () => {
  it('visar sidan för profilbilder', () => {
    expect(angleText({ angle: 'profil', side: 'hoger' })).toBe('Profil (höger sida)');
    expect(angleText({ angle: 'fram' })).toBe('Framifrån');
    expect(angleText({ angle: 'okand' })).toBe('Ej angiven');
  });
});
