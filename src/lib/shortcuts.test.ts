import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS,
  parseShortcut,
  shortcutOutcome,
  shortcutUrl,
  withoutAction,
  type Shortcut,
} from './shortcuts.ts';

const allOn = () => true;
const allOff = () => false;

function byId(id: string): Shortcut {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
}

describe('genvägar', () => {
  it('tre genvägar med egna ikoner och adresser under basen', () => {
    expect(SHORTCUTS.map((s) => s.name)).toEqual(['Logga vikt', '+250 ml (glas)', 'Logga mat']);
    expect(new Set(SHORTCUTS.map((s) => s.icon)).size).toBe(3);
    expect(shortcutUrl('/viktresan/', 'log-weight')).toBe('/viktresan/?action=log-weight');
  });

  it('tolkar ?action= och ignorerar okända värden', () => {
    expect(parseShortcut('?action=log-weight')?.id).toBe('log-weight');
    expect(parseShortcut('?action=add-water')?.id).toBe('add-water');
    expect(parseShortcut('?utm=x&action=log-food')?.id).toBe('log-food');
    expect(parseShortcut('?action=okand')).toBeNull();
    expect(parseShortcut('?action=')).toBeNull();
    expect(parseShortcut('')).toBeNull();
  });

  it('Logga vikt öppnar viktpanelen i Logga', () => {
    expect(shortcutOutcome(byId('log-weight'), allOn)).toEqual({
      kind: 'open',
      hash: '#/logga/vikt',
    });
    // Vikt har ingen brytare och fungerar alltid.
    expect(shortcutOutcome(byId('log-weight'), allOff).kind).toBe('open');
  });

  it('+250 ml vatten loggar direkt och visar Översikt', () => {
    expect(shortcutOutcome(byId('add-water'), allOn)).toEqual({
      kind: 'add-water',
      ml: 250,
      hash: '#/',
    });
  });

  it('Logga mat öppnar panelen i Mat', () => {
    expect(shortcutOutcome(byId('log-food'), allOn)).toEqual({
      kind: 'open',
      hash: '#/mat/logga',
    });
  });

  it('avstängd funktion ger ett meddelande i stället', () => {
    expect(shortcutOutcome(byId('add-water'), (f) => f !== 'vatten')).toEqual({
      kind: 'disabled',
      feature: 'vatten',
    });
    expect(shortcutOutcome(byId('log-food'), (f) => f !== 'mat')).toEqual({
      kind: 'disabled',
      feature: 'mat',
    });
    // Brytaren för en annan funktion påverkar inte.
    expect(shortcutOutcome(byId('log-food'), (f) => f !== 'vatten').kind).toBe('open');
  });

  it('tar bort action ur adressen men behåller resten', () => {
    expect(withoutAction('/viktresan/', '?action=add-water', '')).toBe('/viktresan/');
    expect(withoutAction('/viktresan/', '?a=1&action=log-food', '#/mat')).toBe(
      '/viktresan/?a=1#/mat',
    );
  });
});
