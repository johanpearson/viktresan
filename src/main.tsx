import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { LockGate } from './components/LockGate.tsx';
import { requestPersistence } from './lib/storage.ts';
import './index.css';

// Be webbläsaren att inte rensa vår lokala data vid lagringsbrist.
// Resultatet visas under Inställningar; vi väntar inte in det här.
void requestPersistence();

const root = document.getElementById('root');
if (!root) throw new Error('Hittar inte #root');

createRoot(root).render(
  <StrictMode>
    <LockGate>
      <App />
    </LockGate>
  </StrictMode>,
);
