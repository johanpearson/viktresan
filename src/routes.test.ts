import { describe, expect, it } from 'vitest';
import { NAV_ROUTES, ROUTES, hrefFor, matchHash, routeFromHash } from './routes.ts';

describe('routeFromHash', () => {
  it('tolkar kända hashar', () => {
    expect(routeFromHash('#/logga').id).toBe('logga');
    expect(routeFromHash('#/installningar').id).toBe('installningar');
    expect(routeFromHash('#/mat').id).toBe('mat');
  });

  it('skickar gamla adresser vidare', () => {
    expect(routeFromHash('#/steg').id).toBe('logga');
    expect(matchHash('#/historik').route.id).toBe('framsteg');
    expect(matchHash('#/historik').sub).toBe('');
    expect(matchHash('#/bilder').route.id).toBe('framsteg');
    expect(matchHash('#/bilder').sub).toBe('bilder');
  });

  it('delar upp route och delsökväg', () => {
    expect(matchHash('#/framsteg/bilder').sub).toBe('bilder');
    expect(matchHash('#/framsteg').sub).toBe('');
    expect(matchHash('#/okand/sak')).toEqual({ route: ROUTES[0], sub: '' });
    const framsteg = routeFromHash('#/framsteg');
    expect(hrefFor(framsteg, 'bilder')).toBe('#/framsteg/bilder');
  });

  it('bottennavigeringen: Översikt, Logga, Mat, Kalender, Framsteg; Mat hör till matfunktionen', () => {
    expect(NAV_ROUTES.map((r) => r.label)).toEqual([
      'Översikt',
      'Logga',
      'Mat',
      'Kalender',
      'Framsteg',
    ]);
    expect(NAV_ROUTES.filter((r) => r.feature).map((r) => [r.id, r.feature])).toEqual([
      ['mat', 'mat'],
    ]);
  });

  it('faller tillbaka på Översikt för tom eller okänd hash', () => {
    expect(routeFromHash('').id).toBe('oversikt');
    expect(routeFromHash('#/finns-inte').id).toBe('oversikt');
  });

  it('är konsekvent med hrefFor', () => {
    for (const route of ROUTES) {
      expect(routeFromHash(hrefFor(route))).toBe(route);
    }
  });
});
