import type { ComponentType } from 'react';
import { NavBar } from './components/NavBar.tsx';
import { ShortcutToast } from './components/ShortcutToast.tsx';
import { UpdateToast } from './components/UpdateToast.tsx';
import { useFeatures } from './lib/features.ts';
import { usePreferences } from './lib/preferences.ts';
import { useHashRoute } from './lib/useHashRoute.ts';
import { useShortcut } from './lib/useShortcut.ts';
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
  const preferences = usePreferences();
  // Genvägar på appikonen (?action=…): körs när funktionsbrytarna är lästa.
  const shortcut = useShortcut(features);
  // Vänta in inställningarna så att avstängda delar aldrig blinkar förbi.
  if (!features.loaded || !preferences.loaded) return null;

  // En avstängd sektion (t.ex. ett gammalt bokmärke till Mat) visar Översikt.
  const current = features.isEnabled(route.feature) ? route : DEFAULT_ROUTE;
  const CurrentPage = PAGES[current.id];

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-name">Viktresan</span>
      </header>
      <main className="app-main">
        {/* Ny nyckel när en genväg ändrat data (t.ex. +250 ml) så att sidan läser om. */}
        <CurrentPage key={`${current.id}:${String(shortcut.dataVersion)}`} />
      </main>
      <UpdateToast />
      <ShortcutToast state={shortcut} />
      <NavBar routes={features.filter(NAV_ROUTES)} current={current} />
    </div>
  );
}
