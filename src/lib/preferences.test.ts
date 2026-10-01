import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './preferences.ts';

describe('parsePreferences', () => {
  it('utan lagrat värde gäller standardvärdena', () => {
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('okända fält (t.ex. borttagna funktioners data) släpps', () => {
    expect(parsePreferences({ suggestionsHidden: [{ key: 'lv:1', name: 'Kvarg' }] })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });
});
