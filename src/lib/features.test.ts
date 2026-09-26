import { afterEach, describe, expect, it } from 'vitest';
import { SETTING_FEATURES, getSetting, setSetting } from '../db/db.ts';
import { deleteTestDb } from '../test/db.ts';
import {
  DEFAULT_FLAGS,
  FEATURES,
  FLAGS_VERSION,
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
      vatten: true,
      traning: true,
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

  it('alla funktioner går att slå på', () => {
    expect(FEATURES.filter((f) => !f.available)).toEqual([]);
    const flags = parseFlags({
      version: FLAGS_VERSION,
      ...Object.fromEntries(FEATURES.map((f) => [f.id, true])),
    });
    for (const f of FEATURES) expect(flags[f.id]).toBe(true);
  });
});

describe('nya funktioner', () => {
  it('äldre lagrade "av" för vatten och träning (då kommande) ignoreras', () => {
    const old = {
      steg: false,
      midja: true,
      mat: true,
      vatten: false,
      traning: false,
      bilder: true,
    };
    const flags = parseFlags(old);
    expect(flags.steg).toBe(false);
    expect(flags.vatten).toBe(true);
    expect(flags.traning).toBe(true);
  });

  it('efter version 2 gäller lagrade val även för vatten och träning', () => {
    const flags = parseFlags({ version: FLAGS_VERSION, vatten: false, traning: true });
    expect(flags.vatten).toBe(false);
    expect(flags.traning).toBe(true);
  });
});

describe('GLP-1', () => {
  it('är av som standard; lagrat värde från innan den gick att slå på ignoreras', () => {
    expect(DEFAULT_FLAGS.glp1).toBe(false);
    expect(parseFlags({ version: 2, glp1: true }).glp1).toBe(false);
    expect(parseFlags({ version: 3, glp1: true }).glp1).toBe(true);
  });

  it('kan slås på och av', async () => {
    await initFeatures();
    await setFeature('glp1', true);
    expect(parseFlags(await getSetting(SETTING_FEATURES)).glp1).toBe(true);
    await setFeature('glp1', false);
    expect(parseFlags(await getSetting(SETTING_FEATURES)).glp1).toBe(false);
  });
});

describe('setFeature', () => {
  it('vatten och träning kan slås av och på', async () => {
    await initFeatures();
    await setFeature('vatten', false);
    expect(parseFlags(await getSetting(SETTING_FEATURES)).vatten).toBe(false);
    await setFeature('vatten', true);
    expect(parseFlags(await getSetting(SETTING_FEATURES)).vatten).toBe(true);
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
    expect(await getSetting(SETTING_FEATURES)).toEqual({
      ...DEFAULT_FLAGS,
      mat: false,
      version: FLAGS_VERSION,
    });

    resetFeaturesForTests();
    await setSetting(SETTING_FEATURES, { ...DEFAULT_FLAGS, bilder: false });
    await initFeatures();
    await setFeature('steg', false);
    expect(await getSetting(SETTING_FEATURES)).toEqual({
      ...DEFAULT_FLAGS,
      bilder: false,
      steg: false,
      version: FLAGS_VERSION,
    });
  });
});
