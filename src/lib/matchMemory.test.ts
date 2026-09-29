import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  MATCH_MEMORY_MAX,
  loadMatchMemory,
  memoryKey,
  parseMatchMemory,
  recallMatch,
  rememberMatch,
  saveMatches,
} from './matchMemory.ts';

describe('matchningsminnet', () => {
  it('nyckeln är normaliserad text utan parentes', () => {
    expect(memoryKey('Krossade tomater (400 g)')).toBe('krossade tomater');
    expect(memoryKey('  Kycklingfilé ')).toBe('kycklingfile');
  });

  it('kommer ihåg en manuell matchning och hittar den för samma ingrediens', () => {
    const memory = rememberMatch({}, ['kycklingfilé', 'ca 500 g kycklingfilé'], 'lv:4');
    expect(recallMatch(memory, ['Kycklingfilé'])).toBe('lv:4');
    expect(recallMatch(memory, ['okänd', 'CA 500 G KYCKLINGFILÉ'])).toBe('lv:4');
    expect(recallMatch(memory, ['vetemjöl'])).toBeNull();
  });

  it('en ny matchning ersätter den gamla och flyttas sist', () => {
    let memory = rememberMatch({}, ['lök'], 'lv:1');
    memory = rememberMatch(memory, ['mjöl'], 'lv:2');
    memory = rememberMatch(memory, ['lök'], 'egen:3');
    expect(recallMatch(memory, ['lök'])).toBe('egen:3');
    expect(Object.keys(memory)).toEqual(['mjol', 'lok']);
  });

  it(`sparar högst ${String(MATCH_MEMORY_MAX)} – de äldsta försvinner`, () => {
    let memory = {};
    for (let i = 0; i <= MATCH_MEMORY_MAX; i++) {
      memory = rememberMatch(memory, [`ingrediens ${String(i)}`], `lv:${String(i)}`);
    }
    expect(Object.keys(memory)).toHaveLength(MATCH_MEMORY_MAX);
    expect(recallMatch(memory, ['ingrediens 0'])).toBeNull();
    expect(recallMatch(memory, [`ingrediens ${String(MATCH_MEMORY_MAX)}`])).toBe(
      `lv:${String(MATCH_MEMORY_MAX)}`,
    );
  });

  it('tolkar lagrat värde förlåtande', () => {
    expect(parseMatchMemory(null)).toEqual({});
    expect(parseMatchMemory(['x'])).toEqual({});
    expect(parseMatchMemory({ lok: 'lv:1', fel: 3, '': 'lv:2' })).toEqual({ lok: 'lv:1' });
  });

  it('sparas i inställningarna och läses tillbaka', async () => {
    await saveMatches([{ names: ['gul lök'], foodId: 'lv:2' }]);
    await saveMatches([{ names: ['vetemjöl'], foodId: 'lv:1' }]);
    const memory = await loadMatchMemory();
    expect(recallMatch(memory, ['Gul lök'])).toBe('lv:2');
    expect(recallMatch(memory, ['vetemjöl'])).toBe('lv:1');
  });
});
