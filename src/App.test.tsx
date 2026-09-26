import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import {
  SETTING_FEATURES,
  getSetting,
  listWater,
  saveProfile,
  setSetting,
  upsertSteps,
  upsertWaist,
  putFoodLog,
  putPhoto,
  putPhotoSession,
  putWeight,
} from './db/db.ts';
import { todayIso } from './lib/dates.ts';
import {
  DEFAULT_FLAGS,
  FLAGS_VERSION,
  resetFeaturesForTests,
  type FeatureId,
} from './lib/features.ts';
import { resetPreferencesForTests } from './lib/preferences.ts';
import { resetShortcutForTests } from './lib/useShortcut.ts';
import { deleteTestDb } from './test/db.ts';

// uPlot behöver canvas, som jsdom saknar. Graferna testas i e2e.
vi.mock('./components/WeightChart.tsx', () => ({ WeightChart: () => null }));
vi.mock('./components/StepsChart.tsx', () => ({ StepsChart: () => null }));

afterEach(async () => {
  // Avmontera först, så att inga laddningar hinner öppna databasen igen medan den raderas.
  cleanup();
  resetFeaturesForTests();
  resetPreferencesForTests();
  resetShortcutForTests();
  window.history.replaceState(null, '', '/');
  await deleteTestDb();
});

async function renderAt(hash: string, off: FeatureId[] = []) {
  if (off.length > 0) {
    await setSetting(SETTING_FEATURES, {
      ...Object.fromEntries(
        Object.entries(DEFAULT_FLAGS).map(([id, on]) => [id, on && !off.includes(id as FeatureId)]),
      ),
      version: FLAGS_VERSION,
    });
  }
  window.location.hash = hash;
  render(<App />);
  return screen.findByRole('heading', { level: 1 });
}

function navLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Huvudmeny' });
  return within(nav)
    .getAllByRole('link')
    .map((l) => l.textContent);
}

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** Data av alla slag för idag, så att varje vy har något att visa. */
async function seedToday() {
  const today = todayIso();
  await saveProfile({
    startDate: today,
    startWeightKg: 90,
    heightCm: 180,
    goalWeightKg: 80,
    sex: 'kvinna',
    birthYear: 1985,
    activityLevel: 'latt',
    ratePerWeekKg: 0.5,
  });
  await putWeight({ id: 'w1', date: today, weightKg: 88, createdAt: 1 });
  await upsertWaist(today, 95);
  await upsertSteps(today, 8000);
  await putFoodLog({
    id: 'f1',
    date: today,
    meal: 'frukost',
    foodId: 'egen:x',
    name: 'Gröt',
    amount: 200,
    unit: 'g',
    grams: 200,
    per100: { kcal: 100, proteinG: 3, carbsG: 15, fatG: 2 },
    createdAt: 1,
  });
  await putPhotoSession({ id: 's1', date: today, createdAt: 1 });
  await putPhoto({
    id: 'p1',
    sessionId: 's1',
    angle: 'fram',
    date: today,
    createdAt: 1,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    mimeType: 'image/webp',
    width: 10,
    height: 10,
  });
}

describe('App', () => {
  it('visar navigering med fem sektioner, utan Inställningar', async () => {
    await renderAt('');
    expect(navLabels()).toEqual(['Översikt', 'Logga', 'Mat', 'Kalender', 'Framsteg']);
  });

  it('kugghjulet på Översikt leder till Inställningar', async () => {
    await renderAt('');
    expect(screen.getByLabelText('Inställningar')).toHaveAttribute('href', '#/installningar');
  });

  it('startar på Översikt', async () => {
    expect(await renderAt('')).toHaveTextContent('Översikt');
    expect(screen.getByRole('link', { name: 'Översikt' })).toHaveAttribute('aria-current', 'page');
  });

  it('byter sida när hashen ändras', async () => {
    await renderAt('');
    goTo('#/kalender');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kalender');
  });

  it('gamla adresser till Historik och Bilder öppnar Framsteg', async () => {
    expect(await renderAt('#/historik')).toHaveTextContent('Framsteg');
    expect(screen.getByRole('button', { name: 'Historik' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    goTo('#/bilder');
    expect(screen.getByRole('button', { name: 'Bilder' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: 'Fototillfällen' })).toBeInTheDocument();
  });

  it('Logga öppnar formuläret i en panel', async () => {
    const user = userEvent.setup();
    await renderAt('#/logga');
    await user.click(await screen.findByRole('button', { name: /^Vikt/ }));
    const sheet = screen.getByRole('dialog', { name: 'Logga vikt' });
    expect(within(sheet).getByLabelText('Vikt (kg)')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Stäng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('funktionsbrytare', () => {
  /** Vad som syns i varje vy som påverkas av brytarna. */
  async function observe(off: FeatureId[]) {
    await seedToday();
    await renderAt('', off);
    const today = within(await screen.findByTestId('today-card'))
      .getAllByRole('term')
      .map((dt) => dt.textContent);
    const calorieCard = screen.queryByRole('heading', { name: 'Kalorimål' }) !== null;
    // Kalorier och protein visas som ringar i Idag.
    const rings = screen.queryByTestId('protein-ring') !== null;
    const nav = navLabels();

    goTo('#/logga');
    const tiles = (await screen.findAllByTestId(/^log-tile-/)).map((t) =>
      t.getAttribute('data-testid'),
    );

    goTo('#/framsteg');
    await screen.findByRole('heading', { level: 1, name: 'Framsteg' });
    const tabs = screen
      .queryAllByRole('button', { name: /^(Historik|Bilder)$/ })
      .map((b) => b.textContent);
    const history = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);

    goTo('#/kalender');
    const legend = within(await screen.findByRole('list', { name: 'Förklaring' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // Bilddatumen läses separat; vänta in dem när bilder är på.
    await screen.findByTestId(
      off.includes('bilder') ? 'calendar-value-vikt' : 'calendar-value-bilder',
    );
    const day = within(screen.getByTestId('calendar-day'))
      .queryAllByRole('term')
      .map((dt) => dt.textContent);

    goTo('#/mat');
    const matPage = screen.getByRole('heading', { level: 1 }).textContent;

    goTo('#/framsteg/bilder');
    // Bilder läser sin data asynkront; vänta in Historik eller Bilder.
    await screen.findAllByRole('heading', { level: 2 });
    const bilderTab = screen.queryByRole('heading', { name: 'Fototillfällen' }) !== null;

    return {
      today,
      calorieCard,
      rings,
      nav,
      tiles,
      tabs,
      history,
      legend,
      day,
      matPage,
      bilderTab,
    };
  }

  it('allt påslaget: alla vyer visar steg, midja, mat och bilder', async () => {
    const v = await observe([]);
    expect(v.nav).toEqual(['Översikt', 'Logga', 'Mat', 'Kalender', 'Framsteg']);
    expect(v.today).toEqual(['Vatten', 'Steg', 'Träning']);
    expect(v.calorieCard).toBe(true);
    expect(v.rings).toBe(true);
    expect(v.tiles).toEqual([
      'log-tile-vikt',
      'log-tile-midja',
      'log-tile-steg',
      'log-tile-vatten',
      'log-tile-traning',
    ]);
    expect(v.tabs).toEqual(['Historik', 'Bilder']);
    expect(v.history).toEqual(expect.arrayContaining(['Steg', 'Midjemått']));
    expect(v.legend).toEqual(['Vikt', 'Midja', 'Steg', 'Mat', 'Vatten', 'Träning', 'Bilder']);
    expect(v.day).toEqual(['Vikt', 'Midja', 'Steg', 'Mat', 'Bilder']);
    expect(v.matPage).toBe('Mat');
    expect(v.bilderTab).toBe(true);
  });

  it('steg av: döljs i Logga, Översikt, Kalender och grafer', async () => {
    const v = await observe(['steg']);
    expect(v.tiles).toEqual([
      'log-tile-vikt',
      'log-tile-midja',
      'log-tile-vatten',
      'log-tile-traning',
    ]);
    expect(v.today).toEqual(['Vatten', 'Träning']);
    expect(v.history).not.toContain('Steg');
    expect(v.history).toContain('Midjemått');
    expect(v.legend).not.toContain('Steg');
    expect(v.day).not.toContain('Steg');
    expect(v.nav).toHaveLength(5);
  });

  it('midjemått av: döljs i Logga, Översikt, Kalender och historik', async () => {
    const v = await observe(['midja']);
    expect(v.tiles).toEqual([
      'log-tile-vikt',
      'log-tile-steg',
      'log-tile-vatten',
      'log-tile-traning',
    ]);
    expect(v.today).toEqual(['Vatten', 'Steg', 'Träning']);
    expect(v.history).not.toContain('Midjemått');
    expect(v.history).toContain('Steg');
    expect(v.legend).not.toContain('Midja');
    expect(v.day).not.toContain('Midja');
  });

  it('mat av: döljs i navigeringen, Översikt och Kalender; adressen visar Översikt', async () => {
    const v = await observe(['mat']);
    expect(v.nav).toEqual(['Översikt', 'Logga', 'Kalender', 'Framsteg']);
    expect(v.calorieCard).toBe(false);
    expect(v.rings).toBe(false);
    expect(v.today).toEqual(['Vatten', 'Steg', 'Träning']);
    expect(v.legend).not.toContain('Mat');
    expect(v.day).not.toContain('Mat');
    expect(v.matPage).toBe('Översikt');
    expect(v.tiles).toHaveLength(5);
  });

  it('bilder av: fliken döljs i Framsteg och i Kalender', async () => {
    const v = await observe(['bilder']);
    expect(v.tabs).toEqual(['Historik']);
    expect(v.bilderTab).toBe(false);
    expect(v.legend).not.toContain('Bilder');
    expect(v.day).not.toContain('Bilder');
    expect(v.today).toEqual(['Vatten', 'Steg', 'Träning']);
  });

  it('vatten och träning av: döljs i Logga, Översikt, Kalender och historik', async () => {
    const v = await observe(['vatten', 'traning']);
    expect(v.tiles).toEqual(['log-tile-vikt', 'log-tile-midja', 'log-tile-steg']);
    expect(v.today).toEqual(['Steg']);
    expect(v.rings).toBe(true);
    expect(screen.queryByTestId('water-ring')).not.toBeInTheDocument();
    expect(v.history).not.toContain('Vatten');
    expect(v.legend).toEqual(['Vikt', 'Midja', 'Steg', 'Mat', 'Bilder']);
    expect(screen.queryByRole('list', { name: 'Träningsstatus' })).not.toBeInTheDocument();
  });

  it('brytaren i Inställningar ändrar vyerna direkt, datan ligger kvar', async () => {
    const user = userEvent.setup();
    await seedToday();
    await renderAt('#/installningar');
    const mat = await screen.findByRole('switch', { name: /^Mat/ });
    expect(mat).toBeChecked();
    await user.click(mat);
    expect(mat).not.toBeChecked();
    expect(navLabels()).not.toContain('Mat');
    expect(await getSetting(SETTING_FEATURES)).toMatchObject({ mat: false });

    await user.click(screen.getByRole('switch', { name: /^Steg/ }));
    goTo('#/kalender');
    expect(await screen.findByTestId('calendar-day')).not.toHaveTextContent('8 000 steg');

    goTo('#/installningar');
    await user.click(await screen.findByRole('switch', { name: /^Steg/ }));
    goTo('#/kalender');
    expect(await screen.findByTestId('calendar-value-steg')).toHaveTextContent('8 000 steg');
  });

  it('GLP-1 är av som standard och ger en ruta i Logga när den slås på', async () => {
    const user = userEvent.setup();
    await renderAt('#/installningar');
    const toggle = await screen.findByRole('switch', { name: /^GLP-1/ });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    goTo('#/logga');
    await screen.findByTestId('log-tile-vikt');
    expect(screen.queryByTestId('log-tile-glp1')).not.toBeInTheDocument();

    goTo('#/installningar');
    await user.click(await screen.findByRole('switch', { name: /^GLP-1/ }));
    goTo('#/logga');
    const tile = await screen.findByTestId('log-tile-glp1');
    await waitFor(() => {
      expect(tile).toHaveTextContent('Lägg in läkemedel');
    });
  });
});

describe('genvägar på appikonen', () => {
  async function launch(action: string, off: FeatureId[] = []) {
    window.history.replaceState(null, '', `/?action=${action}`);
    return renderAt('', off);
  }

  it('?action=log-weight öppnar viktpanelen och tas bort ur adressen', async () => {
    await launch('log-weight');
    expect(await screen.findByRole('dialog', { name: 'Logga vikt' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/logga/vikt');
  });

  it('?action=log-food öppnar panelen Logga mat', async () => {
    await launch('log-food');
    const sheet = await screen.findByRole('dialog', { name: 'Logga mat' });
    expect(within(sheet).getByLabelText('Sök livsmedel')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/mat/logga');
  });

  it('?action=add-water loggar 250 ml direkt och kan ångras', async () => {
    const user = userEvent.setup();
    await launch('add-water');
    const toast = await screen.findByTestId('shortcut-toast');
    expect(toast).toHaveTextContent('La till 250 ml vatten.');
    expect((await listWater()).map((w) => w.ml)).toEqual([250]);
    await user.click(within(toast).getByRole('button', { name: 'Ångra' }));
    expect(await within(toast).findByText('Ångrade 250 ml.')).toBeInTheDocument();
    expect(await listWater()).toEqual([]);
    expect(window.location.search).toBe('');
  });

  it('avstängd funktion: meddelande med knapp som slår på den och kör genvägen', async () => {
    const user = userEvent.setup();
    await launch('add-water', ['vatten']);
    const toast = await screen.findByTestId('shortcut-toast');
    expect(toast).toHaveTextContent('Vatten är avstängt');
    expect(await listWater()).toEqual([]);
    await user.click(within(toast).getByRole('button', { name: 'Slå på Vatten' }));
    expect(await screen.findByText('La till 250 ml vatten.')).toBeInTheDocument();
    expect((await listWater()).map((w) => w.ml)).toEqual([250]);
    expect(await getSetting(SETTING_FEATURES)).toMatchObject({ vatten: true });
  });

  it('avstängd mat: Inte nu stänger meddelandet utan att slå på', async () => {
    const user = userEvent.setup();
    await launch('log-food', ['mat']);
    const toast = await screen.findByTestId('shortcut-toast');
    expect(toast).toHaveTextContent('Mat är avstängt');
    await user.click(within(toast).getByRole('button', { name: 'Inte nu' }));
    expect(screen.queryByTestId('shortcut-toast')).not.toBeInTheDocument();
    expect(navLabels()).not.toContain('Mat');
  });
});
