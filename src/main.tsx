import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { LockGate } from './components/LockGate.tsx';
import { initFeatures } from './lib/features.ts';
import { initNavigation } from './lib/navigation.ts';
import { initPreferences } from './lib/preferences.ts';
import { registerServiceWorker } from './lib/pwaUpdate.ts';
import { requestPersistence } from './lib/storage.ts';
import './index.css';

// Be webbläsaren att inte rensa vår lokala data vid lagringsbrist.
// Resultatet visas under Inställningar; vi väntar inte in det här.
void requestPersistence();
// Läs funktionsbrytarna direkt, parallellt med låsinställningen.
void initFeatures();
void initPreferences();

// Service workern finns bara i produktionsbygget. Registrera efter laddningen så
// att den inte konkurrerar med appens egna filer.
if (import.meta.env.PROD) {
  if (document.readyState === 'complete') void registerServiceWorker();
  else
    window.addEventListener('load', () => {
      void registerServiceWorker();
    });
}

const root = document.getElementById('root');
if (!root) throw new Error('Hittar inte #root');

// Historiken först: en djuplänk får Översikt under sig, en omladdning lägger inte till något.
void initNavigation().then(() => {
  createRoot(root).render(
    <StrictMode>
      <LockGate>
        <App />
      </LockGate>
    </StrictMode>,
  );
});
