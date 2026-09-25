import { describe, expect, it } from 'vitest';
import { ROUTES, hrefFor, routeFromHash } from './routes.ts';

describe('routeFromHash', () => {
  it('tolkar kända hashar', () => {
    expect(routeFromHash('#/logga').id).toBe('logga');
    expect(routeFromHash('#/installningar').id).toBe('installningar');
    expect(routeFromHash('#/mat').id).toBe('mat');
  });

  it('skickar den gamla Steg-adressen till Logga', () => {
    expect(routeFromHash('#/steg').id).toBe('logga');
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
