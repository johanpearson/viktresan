import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './preferences.ts';

describe('parsePreferences', () => {
  it('utan lagrat värde gäller standardvärdena', () => {
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('dolda förslag: giltiga poster behålls, dubbletter och felaktiga släpps', () => {
    const prefs = parsePreferences({
      suggestionsHidden: [
        { key: 'lv:1', name: 'Kvarg' },
        { key: 'lv:1', name: 'Kvarg' },
        { key: '', name: 'Tom' },
        { key: 'lv:2' },
        'lv:3',
        { key: 'lv:4+lv:5', name: 'Kvarg + Blåbär' },
      ],
    });
    expect(prefs.suggestionsHidden).toEqual([
      { key: 'lv:1', name: 'Kvarg' },
      { key: 'lv:4+lv:5', name: 'Kvarg + Blåbär' },
    ]);
    expect(parsePreferences({ suggestionsHidden: 'x' }).suggestionsHidden).toEqual([]);
  });
});
