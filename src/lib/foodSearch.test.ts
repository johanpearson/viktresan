import { describe, expect, it } from 'vitest';
import {
  SOURCE_RANK,
  SOURCE_TAGS,
  dedupeKey,
  editDistance,
  isDuplicate,
  normalize,
  searchFoods,
  type FoodSource,
} from './foodSearch.ts';

const FOODS = [
  'Havregryn',
  'Havregrynsgröt',
  'Mjölk fett 3 %',
  'Mjölk fett 0,5 %',
  'Filmjölk fett 3 %',
  'Ägg kokt',
  'Äpple',
  'Banan',
  'Kyckling bröstfilé stekt',
  'Knäckebröd fullkorn',
  'Potatis kokt',
  'Pasta kokt',
].map((name) => ({ name }));

function names(query: string, limit?: number): string[] {
  return searchFoods(FOODS, query, limit).map((f) => f.name);
}

describe('normalize', () => {
  it('gör gemener, viker å/ä/ö och tar bort skiljetecken', () => {
    expect(normalize('Mjölk, fett 3 %')).toBe('mjolk fett 3');
    expect(normalize('ÄPPLE Å')).toBe('apple a');
    expect(normalize('  Kyckling—bröstfilé ')).toBe('kyckling brostfile');
  });
});

describe('editDistance', () => {
  it('räknar ersättningar, tillägg, borttagningar och omkastningar', () => {
    expect(editDistance('havregryn', 'havregryn', 2)).toBe(0);
    expect(editDistance('havregrin', 'havregryn', 2)).toBe(1);
    expect(editDistance('bnaan', 'banan', 2)).toBe(1);
    expect(editDistance('potatis', 'potatiss', 2)).toBe(1);
  });

  it('avbryter över taket', () => {
    expect(editDistance('abc', 'xyzxyz', 1)).toBe(2);
    expect(editDistance('kyckling', 'knäckebröd', 2)).toBe(3);
  });
});

describe('searchFoods', () => {
  it('hittar på början av ord och sorterar exakta träffar först', () => {
    expect(names('havregryn')).toEqual(['Havregryn', 'Havregrynsgröt']);
    expect(names('ban')).toEqual(['Banan']);
  });

  it('tål att å, ä och ö skrivs utan prickar', () => {
    expect(names('mjolk')).toEqual(['Mjölk fett 3 %', 'Mjölk fett 0,5 %', 'Filmjölk fett 3 %']);
    expect(names('agg')).toEqual(['Ägg kokt']);
  });

  it('tål stavfel', () => {
    expect(names('havregrin')[0]).toBe('Havregryn');
    expect(names('kyklin')).toEqual(['Kyckling bröstfilé stekt']);
    expect(names('bnaan')).toEqual(['Banan']);
  });

  it('hittar delar av sammansatta ord', () => {
    expect(names('gröt')).toEqual(['Havregrynsgröt']);
    // "bröd" ligger nära "bröst" också, men delordet i knäckebröd rankas först.
    expect(names('bröd')[0]).toBe('Knäckebröd fullkorn');
  });

  it('kräver att alla sökord träffar', () => {
    expect(names('kokt potatis')).toEqual(['Potatis kokt']);
    expect(names('mjölk 0,5')).toEqual(['Mjölk fett 0,5 %']);
  });

  it('ger tomt resultat för tom sökning eller ingen träff', () => {
    expect(names('')).toEqual([]);
    expect(names('   ')).toEqual([]);
    expect(names('pizza')).toEqual([]);
  });

  it('korta sökord kräver exakt början (inga stavfel)', () => {
    expect(names('kn')).toEqual(['Knäckebröd fullkorn']);
    expect(names('xy')).toEqual([]);
  });

  it('begränsar antalet träffar', () => {
    expect(names('kokt', 2)).toHaveLength(2);
  });
});

describe('sökning i alla källor', () => {
  type Hit = { id: string; name: string; source: FoodSource; per100: { kcal: number } };
  const food = (id: string, name: string, source: FoodSource, kcal: number): Hit => ({
    id,
    name,
    source,
    per100: { kcal },
  });
  const ALL: Hit[] = [
    food('fi:1', 'Rönnbär', 'fineli', 49),
    food('lv:1', 'Rönnbär', 'livsmedelsverket', 80),
    food('fi:2', 'Mjölk, 3 % fett', 'fineli', 61),
    food('lv:2', 'Mjölk fett 3 %', 'livsmedelsverket', 60),
    food('lv:3', 'Mjölk fett 0,5 %', 'livsmedelsverket', 39),
    food('fi:3', 'Karelsk pirog', 'fineli', 236),
    food('off:3', 'Karelsk pirog', 'openfoodfacts', 230),
    food('egen:1', 'Rönnbär', 'egen', 50),
    food('lv:4', 'Ost hårdost fett 17 %', 'livsmedelsverket', 287),
    food('fi:4', 'Ost hårdost fett 27 %', 'fineli', 360),
    food('lv:5', 'Yoghurt naturell fett 3 %', 'livsmedelsverket', 60),
    food('fi:5', 'Yogurt naturell fett 3 %', 'fineli', 62),
  ];
  const ids = (query: string) => searchFoods(ALL, query).map((f) => f.id);

  it('visar samma livsmedel från flera databaser en gång, från Livsmedelsverket', () => {
    expect(ids('rönnbär')).toEqual(['egen:1', 'lv:1']);
    // Samma ord i annan ordning och med skiljetecken.
    expect(ids('mjölk 3')).toEqual(['lv:2']);
    // Stavningsvariant med liknande energi.
    expect(ids('naturell')).toEqual(['lv:5']);
  });

  it('döljer aldrig användarens egna livsmedel', () => {
    expect(ids('rönnbär')).toContain('egen:1');
  });

  it('slår inte ihop liknande namn med olika energi', () => {
    expect(ids('hårdost')).toEqual(['lv:4', 'fi:4']);
  });

  it('en skannad Open Food Facts-produkt går före en Fineli-dubblett', () => {
    expect(ids('karelsk')).toEqual(['off:3']);
    expect(ids('pirog')).toEqual(['off:3']);
  });

  it('prioriterar Livsmedelsverket vid likvärdig träff men bättre träff vinner', () => {
    const items = [
      food('fi:10', 'Banan', 'fineli', 88),
      food('lv:10', 'Banan torkad', 'livsmedelsverket', 374),
      food('fi:11', 'Banan torkad extra', 'fineli', 370),
      food('lv:11', 'Bananchips', 'livsmedelsverket', 514),
    ];
    // Hela namnet exakt först, sedan LV före Fineli vid samma poäng, sist början av ord ("bananchips").
    expect(searchFoods(items, 'banan').map((f) => f.id)).toEqual([
      'fi:10',
      'lv:10',
      'fi:11',
      'lv:11',
    ]);
    expect(searchFoods(items, 'banan torkad').map((f) => f.id)).toEqual(['lv:10', 'fi:11']);
  });

  it('rangordnar källorna: egna, Livsmedelsverket, Open Food Facts, Fineli', () => {
    const order = (Object.keys(SOURCE_RANK) as FoodSource[]).sort(
      (a, b) => SOURCE_RANK[a] - SOURCE_RANK[b],
    );
    expect(order.slice(-3)).toEqual(['livsmedelsverket', 'openfoodfacts', 'fineli']);
  });

  it('har korta källetiketter för LV, Fineli, OFF och Egen', () => {
    expect(SOURCE_TAGS).toEqual({
      livsmedelsverket: 'LV',
      fineli: 'Fineli',
      openfoodfacts: 'OFF',
      egen: 'Egen',
    });
  });
});

describe('dedupeKey och isDuplicate', () => {
  it('bortser från ordföljd, skiljetecken och småord', () => {
    expect(dedupeKey('Mjölk, 3 % fett')).toBe(dedupeKey('Mjölk fett 3 %'));
    expect(dedupeKey('Potatis kokt m. salt')).toBe(dedupeKey('Potatis, kokt, salt'));
    expect(dedupeKey('Potatis kokt utan salt')).not.toBe(dedupeKey('Potatis kokt m. salt'));
  });

  it('kräver liknande energi för stavningsvarianter men inte för samma namn', () => {
    const k = (name: string, kcal: number | null) => ({ key: dedupeKey(name), kcal });
    expect(isDuplicate(k('Rönnbär', 80), k('Rönnbär', 49))).toBe(true);
    expect(isDuplicate(k('Yoghurt naturell', 60), k('Yogurt naturell', 62))).toBe(true);
    expect(isDuplicate(k('Yoghurt naturell', 60), k('Yogurt naturell', 120))).toBe(false);
    expect(isDuplicate(k('Ost 17', 280), k('Ost 27', 280))).toBe(false); // kort nyckel
  });
});
