import { describe, expect, it } from 'vitest';
import { parseShare, withoutShare } from './shareTarget.ts';

describe('delning till appen (Web Share Target)', () => {
  it('ingen delning utan parametrarna', () => {
    expect(parseShare('')).toBeNull();
    expect(parseShare('?action=log-food')).toBeNull();
  });

  it('delad länk går före texten', () => {
    expect(
      parseShare('?share-title=Gryta&share-text=Testa&share-url=https%3A%2F%2Fica.se%2Fr%2F1'),
    ).toEqual({ input: 'https://ica.se/r/1' });
  });

  it('Android lägger länken i texten – den letas upp', () => {
    const text = encodeURIComponent('Kycklinggryta | ICA https://www.ica.se/recept/a/.');
    expect(parseShare(`?share-title=&share-text=${text}`)).toEqual({
      input: 'https://www.ica.se/recept/a/',
    });
  });

  it('en receptext förifylls som den är', () => {
    const text = encodeURIComponent('2 dl mjölk\n3 ägg');
    expect(parseShare(`?share-text=${text}`)).toEqual({ input: '2 dl mjölk\n3 ägg' });
    expect(parseShare('?share-title=Pannkakor')).toEqual({ input: 'Pannkakor' });
  });

  it('adressen utan delningens parametrar', () => {
    expect(
      withoutShare('/viktresan/', '?share-text=a&share-url=b&share-title=c&x=1', '#/mat/importera'),
    ).toBe('/viktresan/?x=1#/mat/importera');
    expect(withoutShare('/viktresan/', '?share-url=b', '')).toBe('/viktresan/');
  });
});
