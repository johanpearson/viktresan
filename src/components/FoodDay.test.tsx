import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import type { FoodData } from '../lib/useFoodData.ts';
import { FoodDay } from './FoodDay.tsx';

const per100 = { kcal: 100, proteinG: 10, carbsG: 10, fatG: 2 };

function entry(id: string, meal: FoodLogEntry['meal'], grams: number): FoodLogEntry {
  return {
    id,
    date: '2026-09-27',
    meal,
    foodId: `egen:${id}`,
    name: `Mat ${id}`,
    amount: grams,
    unit: 'g',
    grams,
    per100,
    createdAt: 1,
  };
}

const foodData: FoodData = { foods: [], meals: [], favorites: [], foodUnits: [] };

function renderDay(foodLog: FoodLogEntry[]) {
  return render(
    <FoodDay
      source={{ foodData, livsmedel: null, foodLog, reloadFood: () => Promise.resolve(foodData) }}
      targetKcal={2000}
      proteinGoalG={120}
      reloadLog={() => Promise.resolve()}
    />,
  );
}

function header(slot: string): HTMLElement {
  return screen.getByTestId(`meal-${slot}`);
}

describe('Mat → Dag', () => {
  beforeEach(() => {
    // Lunchtid.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 27, 12, 30) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const log = [
    entry('a', 'frukost', 200),
    entry('b', 'frukost', 150),
    entry('c', 'lunch', 400),
    entry('d', 'mellanmal', 50),
  ];

  it('summerar kcal och antal poster per måltid', () => {
    renderDay(log);
    expect(within(header('frukost')).getByRole('button', { name: /Frukost/ })).toHaveTextContent(
      'Frukost2 poster350 kcal',
    );
    expect(within(header('lunch')).getByRole('button', { name: /Lunch/ })).toHaveTextContent(
      'Lunch1 post400 kcal',
    );
    // Tom måltid: bara namnet och +.
    const middag = header('middag');
    expect(within(middag).queryByRole('button', { expanded: false })).toBeNull();
    expect(within(middag).getByRole('button', { name: 'Lägg till i middag' })).toBeInTheDocument();
    expect(screen.getByTestId('intake')).toHaveTextContent('800 / 2 000 kcal');
  });

  it('fäller ut pågående måltid enligt klockslaget, övriga är ihopfällda', async () => {
    const user = userEvent.setup();
    renderDay(log);
    const lunch = within(header('lunch')).getByRole('button', { name: /Lunch/ });
    const frukost = within(header('frukost')).getByRole('button', { name: /Frukost/ });
    expect(lunch).toHaveAttribute('aria-expanded', 'true');
    expect(frukost).toHaveAttribute('aria-expanded', 'false');
    expect(within(header('lunch')).getAllByTestId('food-entry')).toHaveLength(1);
    expect(within(header('frukost')).queryAllByTestId('food-entry')).toHaveLength(0);

    await user.click(frukost);
    expect(frukost).toHaveAttribute('aria-expanded', 'true');
    expect(within(header('frukost')).getAllByTestId('food-entry')).toHaveLength(2);
    await user.click(lunch);
    expect(within(header('lunch')).queryAllByTestId('food-entry')).toHaveLength(0);
  });

  it('på kvällen är middagen utfälld', () => {
    vi.setSystemTime(new Date(2026, 8, 27, 18, 0));
    renderDay([...log, entry('e', 'middag', 300)]);
    expect(within(header('middag')).getByRole('button', { name: /Middag/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(header('lunch')).getByRole('button', { name: /Lunch/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
