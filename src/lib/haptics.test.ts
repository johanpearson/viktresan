import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haptic } from './haptics.ts';
import { resetPreferencesForTests, setPreference } from './preferences.ts';

describe('haptic', () => {
  const vibrate = vi.fn(() => true);

  beforeEach(() => {
    resetPreferencesForTests();
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('vibrerar kort vid spara', () => {
    haptic('success');
    expect(vibrate).toHaveBeenCalledWith([12]);
  });

  it('vibrerar inte när inställningen är av', async () => {
    await setPreference('haptics', false);
    haptic('success');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrerar inte vid prefers-reduced-motion', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    haptic('light');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('gör ingenting utan navigator.vibrate', () => {
    Reflect.deleteProperty(navigator, 'vibrate');
    expect(() => {
      haptic();
    }).not.toThrow();
  });
});
