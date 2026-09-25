import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { NAV_ROUTES } from './routes.ts';

describe('App', () => {
  it('visar navigering med fem sektioner, utan Inställningar', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Huvudmeny' });
    expect(NAV_ROUTES).toHaveLength(5);
    for (const route of NAV_ROUTES) {
      expect(nav).toHaveTextContent(route.label);
    }
    expect(nav).not.toHaveTextContent('Inställningar');
  });

  it('kugghjulet på Översikt leder till Inställningar', () => {
    render(<App />);
    expect(screen.getByLabelText('Inställningar')).toHaveAttribute('href', '#/installningar');
  });

  it('startar på Översikt', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Översikt');
    expect(screen.getByRole('link', { name: 'Översikt' })).toHaveAttribute('aria-current', 'page');
  });

  it('byter sida när hashen ändras', () => {
    render(<App />);
    act(() => {
      window.location.hash = '#/historik';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Historik');
  });
});
