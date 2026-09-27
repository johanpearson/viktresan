import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays } from '../lib/dates.ts';
import type { DailyWeight } from '../lib/stats.ts';
import { WeightDays } from './WeightDays.tsx';

function days(count: number): DailyWeight[] {
  return Array.from({ length: count }, (_, i) => ({
    date: addDays('2026-06-01', i),
    weightKg: 90 - i * 0.1,
    count: 1,
  }));
}

const rows = () => screen.getAllByRole('row').length - 1; // utan rubrikraden

describe('WeightDays', () => {
  it('visar de 14 senaste dagarna, nyast först, och fler per tryck', async () => {
    const user = userEvent.setup();
    render(<WeightDays daily={days(50)} trendByDate={new Map()} />);
    expect(rows()).toBe(14);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('20 juli 2026');

    await user.click(screen.getByRole('button', { name: 'Visa 28 dagar till' }));
    expect(rows()).toBe(42);
    await user.click(screen.getByRole('button', { name: 'Visa 8 dagar till' }));
    expect(rows()).toBe(50);
    expect(screen.queryByRole('button', { name: /^Visa/ })).toBeNull();
  });

  it('ingen knapp när allt ryms', () => {
    render(<WeightDays daily={days(5)} trendByDate={new Map()} />);
    expect(rows()).toBe(5);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
