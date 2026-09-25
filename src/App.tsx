import type { ComponentType } from 'react';
import { NavBar } from './components/NavBar.tsx';
import { UpdateToast } from './components/UpdateToast.tsx';
import { useFeatures } from './lib/features.ts';
import { useHashRoute } from './lib/useHashRoute.ts';
import { Framsteg } from './pages/Framsteg.tsx';
import { Installningar } from './pages/Installningar.tsx';
import { Kalender } from './pages/Kalender.tsx';
import { Logga } from './pages/Logga.tsx';
import { Mat } from './pages/Mat.tsx';
import { Oversikt } from './pages/Oversikt.tsx';
import { DEFAULT_ROUTE, NAV_ROUTES, type RouteId } from './routes.ts';

const PAGES: Record<RouteId, ComponentType> = {
  oversikt: Oversikt,
  logga: Logga,
  mat: Mat,
  kalender: Kalender,
  framsteg: Framsteg,
  installningar: Installningar,
};

export function App() {
  const { route } = useHashRoute();
  const features = useFeatures();
  // Vänta in funktionsinställningen så att avstängda delar aldrig blinkar förbi.
  if (!features.loaded) return null;

  // En avstängd sektion (t.ex. ett gammalt bokmärke till Mat) visar Översikt.
  const current = features.isEnabled(route.feature) ? route : DEFAULT_ROUTE;
  const CurrentPage = PAGES[current.id];

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-name">Viktresan</span>
      </header>
      <main className="app-main">
        <CurrentPage key={current.id} />
      </main>
      <UpdateToast />
      <NavBar routes={features.filter(NAV_ROUTES)} current={current} />
    </div>
  );
}
