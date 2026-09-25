import type { ComponentType } from 'react';
import { NavBar } from './components/NavBar.tsx';
import { useHashRoute } from './lib/useHashRoute.ts';
import { Bilder } from './pages/Bilder.tsx';
import { Historik } from './pages/Historik.tsx';
import { Installningar } from './pages/Installningar.tsx';
import { Logga } from './pages/Logga.tsx';
import { Oversikt } from './pages/Oversikt.tsx';
import type { RouteId } from './routes.ts';

const PAGES: Record<RouteId, ComponentType> = {
  oversikt: Oversikt,
  logga: Logga,
  bilder: Bilder,
  historik: Historik,
  installningar: Installningar,
};

export function App() {
  const route = useHashRoute();
  const CurrentPage = PAGES[route.id];

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-name">Viktresan</span>
      </header>
      <main className="app-main">
        <CurrentPage key={route.id} />
      </main>
      <NavBar current={route} />
    </div>
  );
}
