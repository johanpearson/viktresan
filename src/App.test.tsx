import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { ROUTES } from './routes.ts';

describe('App', () => {
  it('visar navigering med alla sektioner', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Huvudmeny' });
    for (const route of ROUTES) {
      expect(nav).toHaveTextContent(route.label);
    }
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
