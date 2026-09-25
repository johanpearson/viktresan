import { afterEach, describe, expect, it } from 'vitest';
import { SETTING_FEATURES, getSetting, setSetting } from '../db/db.ts';
import { deleteTestDb } from '../test/db.ts';
import {
  DEFAULT_FLAGS,
  FEATURES,
  filterEnabled,
  initFeatures,
  parseFlags,
  resetFeaturesForTests,
  setFeature,
} from './features.ts';

afterEach(async () => {
  resetFeaturesForTests();
  await deleteTestDb();
});

describe('parseFlags', () => {
  it('ger standardlägen utan lagrat värde', () => {
    expect(parseFlags(undefined)).toEqual(DEFAULT_FLAGS);
    expect(DEFAULT_FLAGS).toEqual({
      steg: true,
      midja: true,
      mat: true,
      vatten: false,
      traning: false,
      glp1: false,
      bilder: true,
    });
  });

  it('läser lagrade lägen och släpper okända nycklar och felaktiga värden', () => {
    const flags = parseFlags({ steg: false, mat: 'nej', okand: true });
    expect(flags.steg).toBe(false);
    expect(flags.mat).toBe(true);
    expect(flags).not.toHaveProperty('okand');
  });

  it('kommande funktioner kan inte slås på', () => {
    const upcoming = FEATURES.filter((f) => !f.available);
    expect(upcoming.map((f) => f.id)).toEqual(['vatten', 'traning', 'glp1']);
    const flags = parseFlags(Object.fromEntries(upcoming.map((f) => [f.id, true])));
    for (const f of upcoming) expect(flags[f.id]).toBe(false);
  });
});

describe('filterEnabled', () => {
  it('behåller poster utan funktion och poster vars funktion är på', () => {
    const items = [
      { id: 'a' },
      { id: 'b', feature: 'mat' as const },
      { id: 'c', feature: 'steg' as const },
    ];
    const flags = { ...DEFAULT_FLAGS, mat: false };
    expect(filterEnabled(flags, items).map((i) => i.id)).toEqual(['a', 'c']);
  });
});

describe('lagring', () => {
  it('sparar ändringar i IndexedDB och läser dem vid nästa start', async () => {
    await initFeatures();
    await setFeature('mat', false);
    expect(await getSetting(SETTING_FEATURES)).toEqual({ ...DEFAULT_FLAGS, mat: false });

    resetFeaturesForTests();
    await setSetting(SETTING_FEATURES, { ...DEFAULT_FLAGS, bilder: false });
    await initFeatures();
    await setFeature('steg', false);
    expect(await getSetting(SETTING_FEATURES)).toEqual({
      ...DEFAULT_FLAGS,
      bilder: false,
      steg: false,
    });
  });
});
