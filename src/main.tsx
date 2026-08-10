import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App.tsx';
import './styles.css';

// Keeps the installed app updated in the background. Because the whole app is
// precached, a home-screen launch works with no connection at all.
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
