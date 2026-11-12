import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useGame } from './app/store';
import { installUiScale } from './app/uiScale';
import { claimInstance } from './app/instance';
import { loadCityArt } from './render/textures';
import './styles.css';

// Street photographs start while the menu is up, so the painted city is
// already waiting and the files are not a surprise when the week begins.
void loadCityArt();

// The desktop app's interface scale, before the first frame is drawn.
installUiScale(() => useGame.getState().uiScale);

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

// Each tab claims its own save and report names before anything is read.
void Promise.race([claimInstance(), new Promise((r) => setTimeout(r, 500))]).finally(() => createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
));
