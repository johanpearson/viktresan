import { useEffect, type ComponentType } from 'react';
import { DiscardPrompt } from './components/DiscardPrompt.tsx';
import { MilestoneCenter } from './components/MilestoneCenter.tsx';
import { NavBar } from './components/NavBar.tsx';
import { ShortcutToast } from './components/ShortcutToast.tsx';
import { UpdateToast } from './components/UpdateToast.tsx';
import { useFeatures } from './lib/features.ts';
import { pruneOrphansSoon } from './lib/navigation.ts';
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
  // Efter omladdning eller upplåsning: poster för paneler som inte öppnas igen tas bort.
  useEffect(() => {
    pruneOrphansSoon();
  }, []);
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
      {/* På Översikt är "Ny version finns" ett kontextkort (UpdateCard) i stället för en toast. */}
      {current.id !== 'oversikt' && <UpdateToast />}
      <ShortcutToast state={shortcut} />
      <MilestoneCenter features={features} />
      <DiscardPrompt />
      <NavBar routes={features.filter(NAV_ROUTES)} current={current} />
    </div>
  );
}
