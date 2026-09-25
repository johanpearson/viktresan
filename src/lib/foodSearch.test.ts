import { describe, expect, it } from 'vitest';
import { editDistance, normalize, searchFoods } from './foodSearch.ts';

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
