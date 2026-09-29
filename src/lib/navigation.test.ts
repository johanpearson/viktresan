import { act, cleanup, render } from '@testing-library/react';
import { createElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chainFor,
  initNavigation,
  navigate,
  normalizeHash,
  planNavigation,
  resetNavigationForTests,
  useOverlay,
} from './navigation.ts';

describe('stackregler', () => {
  it('ger kedjan från roten till adressen', () => {
    expect(chainFor('')).toEqual(['#/']);
    expect(chainFor('#/')).toEqual(['#/']);
    expect(chainFor('#/okand')).toEqual(['#/']);
    expect(chainFor('#/mat')).toEqual(['#/', '#/mat']);
    // Delsökvägar som öppnar en panel eller är en flik i sidan ligger på flikens nivå.
    expect(chainFor('#/logga/vikt')).toEqual(['#/', '#/logga/vikt']);
    expect(chainFor('#/framsteg/veckor')).toEqual(['#/', '#/framsteg/veckor']);
    // Undervy: egen nivå under sin förälder.
    expect(chainFor('#/framsteg/rapport/visa')).toEqual([
      '#/',
      '#/framsteg/rapport',
      '#/framsteg/rapport/visa',
    ]);
  });

  it('följer flyttade adresser', () => {
    expect(normalizeHash('#/historik')).toBe('#/framsteg');
    expect(chainFor('#/bilder')).toEqual(['#/', '#/framsteg/bilder']);
  });

  it('flikbyte från Översikt lägger till en post', () => {
    expect(planNavigation({ depth: 0, page: 0, hash: '#/' }, '#/mat')).toEqual({
      back: 0,
      replace: null,
      push: ['#/mat'],
    });
  });

  it('flikbyte mellan två andra flikar ersätter posten', () => {
    expect(planNavigation({ depth: 1, page: 1, hash: '#/mat' }, '#/kalender')).toEqual({
      back: 0,
      replace: '#/kalender',
      push: [],
    });
  });

  it('Översikt går tillbaka till roten i stället för att lägga till', () => {
    expect(planNavigation({ depth: 1, page: 1, hash: '#/mat' }, '#/')).toEqual({
      back: 1,
      replace: null,
      push: [],
    });
    // Från en undervy med en öppen panel: alla steg på en gång.
    expect(planNavigation({ depth: 3, page: 2, hash: '#/framsteg/rapport/visa' }, '#/')).toEqual({
      back: 3,
      replace: null,
      push: [],
    });
  });

  it('Översikt på Översikt gör ingenting', () => {
    expect(planNavigation({ depth: 0, page: 0, hash: '#/' }, '#/')).toEqual({
      back: 0,
      replace: null,
      push: [],
    });
  });

  it('undervy läggs ovanpå fliken, och föräldern nås med ett steg bakåt', () => {
    expect(
      planNavigation({ depth: 1, page: 1, hash: '#/framsteg/rapport' }, '#/framsteg/rapport/visa'),
    ).toEqual({ back: 0, replace: '#/framsteg/rapport', push: ['#/framsteg/rapport/visa'] });
    expect(
      planNavigation({ depth: 2, page: 2, hash: '#/framsteg/rapport/visa' }, '#/framsteg/rapport'),
    ).toEqual({ back: 1, replace: '#/framsteg/rapport', push: [] });
  });

  it('djuplänk till en undervy från Översikt lägger till både flik och undervy', () => {
    expect(planNavigation({ depth: 0, page: 0, hash: '#/' }, '#/framsteg/rapport/visa')).toEqual({
      back: 0,
      replace: null,
      push: ['#/framsteg/rapport', '#/framsteg/rapport/visa'],
    });
  });

  it('en länk i en öppen panel stänger panelen innan fliken byts', () => {
    // Logga (1) + panel (2) → Mat: ett steg bakåt, sedan ersätts flikposten.
    expect(planNavigation({ depth: 2, page: 1, hash: '#/logga' }, '#/mat/naring')).toEqual({
      back: 1,
      replace: '#/mat/naring',
      push: [],
    });
    // Panel på Översikt → flik: stäng panelen, lägg sedan till fliken.
    expect(planNavigation({ depth: 1, page: 0, hash: '#/' }, '#/logga/glp1')).toEqual({
      back: 1,
      replace: null,
      push: ['#/logga/glp1'],
    });
  });

  it('samma vy med en öppen panel stänger bara panelen', () => {
    expect(planNavigation({ depth: 2, page: 1, hash: '#/mat' }, '#/mat')).toEqual({
      back: 1,
      replace: null,
      push: [],
    });
  });

  it('djupet blir aldrig mer än Översikt → flik → undervy under överläggen', () => {
    const start = { depth: 2, page: 2, hash: '#/framsteg/rapport/visa' };
    for (const target of ['#/mat', '#/kalender', '#/framsteg/rapport/visa', '#/logga/vikt']) {
      const plan = planNavigation(start, target);
      const depth = start.depth - plan.back + plan.push.length;
      expect(depth).toBe(chainFor(target).length - 1);
    }
  });
});

// --- Historiken i jsdom -----------------------------------------------------------------------

function navState(): { depth: number; page: number } | undefined {
  const nav = (window.history.state as { viktresanNav?: { depth: number; page: number } } | null)
    ?.viktresanNav;
  return nav && { depth: nav.depth, page: nav.page };
}

/** Väntar tills historiken står still (history.go är asynkront). */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function back(): Promise<void> {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function Sheet({ onClose, dirty = false }: { onClose: () => void; dirty?: boolean }) {
  useOverlay(onClose, { dirty: () => dirty });
  return createElement('p', null, 'panel');
}

function Host({ dirty = false, onClosed }: { dirty?: boolean; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          setOpen((o) => !o);
        },
      },
      'växla',
    ),
    open &&
      createElement(Sheet, {
        dirty,
        onClose: () => {
          onClosed?.();
          setOpen(false);
        },
      }),
  );
}

describe('historiken', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    resetNavigationForTests();
  });
  afterEach(() => {
    cleanup();
  });

  it('djuplänk vid start: Översikt under målet', async () => {
    window.history.replaceState(null, '', '/#/mat');
    const length = window.history.length;
    await initNavigation();
    expect(window.location.hash).toBe('#/mat');
    expect(navState()).toEqual({ depth: 1, page: 1 });
    expect(window.history.length).toBe(length + 1);
    await back();
    expect(window.location.hash).toBe('#/');
    expect(navState()).toEqual({ depth: 0, page: 0 });
  });

  it('omladdning lägger inte till några poster', async () => {
    window.history.replaceState({ viktresanNav: { depth: 1, page: 1 } }, '', '/#/kalender');
    const length = window.history.length;
    await initNavigation();
    expect(window.history.length).toBe(length);
    expect(window.location.hash).toBe('#/kalender');
    expect(navState()).toEqual({ depth: 1, page: 1 });
  });

  it('Översikt → Mat → Kalender → bakåt landar på Översikt', async () => {
    await initNavigation();
    navigate('#/mat');
    navigate('#/kalender');
    await settle();
    expect(window.location.hash).toBe('#/kalender');
    expect(navState()).toEqual({ depth: 1, page: 1 });
    await back();
    expect(window.location.hash).toBe('#/');
  });

  it('Översikt i navigeringen går tillbaka i stället för att lägga till', async () => {
    await initNavigation();
    navigate('#/framsteg/rapport');
    navigate('#/framsteg/rapport/visa');
    await settle();
    expect(navState()).toEqual({ depth: 2, page: 2 });
    const length = window.history.length;
    navigate('#/');
    await settle();
    expect(window.location.hash).toBe('#/');
    expect(navState()).toEqual({ depth: 0, page: 0 });
    // Inga nya poster: framåt finns kvar, men inget lades till.
    expect(window.history.length).toBe(length);
  });

  it('undervy: bakåt går till föräldern', async () => {
    await initNavigation();
    navigate('#/framsteg/rapport');
    navigate('#/framsteg/rapport/visa');
    await settle();
    await back();
    expect(window.location.hash).toBe('#/framsteg/rapport');
  });

  it('en panel får en post; bakåt stänger den och stannar i vyn', async () => {
    await initNavigation();
    navigate('#/mat');
    await settle();
    const onClosed = vi.fn();
    const view = render(createElement(Host, { onClosed }));
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    expect(view.queryByText('panel')).not.toBeNull();
    expect(navState()).toEqual({ depth: 2, page: 1 });
    await back();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(view.queryByText('panel')).toBeNull();
    expect(window.location.hash).toBe('#/mat');
    expect(navState()).toEqual({ depth: 1, page: 1 });
  });

  it('en panel som stängs med knapp tar bort sin post', async () => {
    await initNavigation();
    navigate('#/mat');
    await settle();
    const view = render(createElement(Host));
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    expect(navState()).toEqual({ depth: 2, page: 1 });
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    await settle();
    expect(view.queryByText('panel')).toBeNull();
    expect(navState()).toEqual({ depth: 1, page: 1 });
    // Nästa bakåt går till Översikt, ingen hängande post.
    await back();
    expect(window.location.hash).toBe('#/');
  });

  it('osparade ändringar: bakåt lägger tillbaka posten och frågar först', async () => {
    await initNavigation();
    const onClosed = vi.fn();
    const view = render(createElement(Host, { dirty: true, onClosed }));
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    await back();
    expect(onClosed).not.toHaveBeenCalled();
    expect(view.queryByText('panel')).not.toBeNull();
    expect(navState()).toEqual({ depth: 1, page: 0 });
  });

  it('en länk i en öppen panel stänger panelen och byter flik', async () => {
    await initNavigation();
    navigate('#/logga');
    await settle();
    const onClosed = vi.fn();
    const view = render(createElement(Host, { onClosed }));
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    navigate('#/mat');
    await settle();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/mat');
    expect(navState()).toEqual({ depth: 1, page: 1 });
    await back();
    expect(window.location.hash).toBe('#/');
  });

  it('lägger tillbaka poster som webbläsaren hoppat över när appen själv backar', async () => {
    await initNavigation();
    navigate('#/installningar');
    await settle();
    const view = render(createElement(Host));
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    expect(navState()).toEqual({ depth: 2, page: 1 });
    // Som Chrome med en post som lagts till utan användaraktivering: steget landar på roten.
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {
      setTimeout(() => {
        window.history.replaceState({ viktresanNav: { depth: 0, page: 0, trail: [] } }, '', '/#/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, 0);
    });
    await act(async () => {
      view.getByRole('button').click();
      await Promise.resolve();
    });
    await settle();
    go.mockRestore();
    expect(view.queryByText('panel')).toBeNull();
    expect(window.location.hash).toBe('#/installningar');
    expect(navState()).toEqual({ depth: 1, page: 1 });
  });
});
