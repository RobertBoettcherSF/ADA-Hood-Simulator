import { useGame } from '../app/store';
import { installDeskTextures } from './desk/textures';
import { GameOverScreen } from './GameOverScreen';
import { GameScreen } from './GameScreen';
import { MainMenu } from './MainMenu';
import { NewGameScreen } from './NewGameScreen';
import { Toast } from './Toast';
import { DialogFrame } from './DialogFrame';
import { TitleSequence } from './TitleSequence';
import { AlwaysChrome } from './AlwaysChrome';
import { FolderGate } from './FolderGate';
import { useState } from 'react';

/** The title plays once a session, and not under automated checks (?audit). */
function titleWanted(): boolean {
  if (typeof window === 'undefined' || /[?&](audit|notitle)/.test(window.location.search) || navigator.webdriver) return false;
  try { return sessionStorage.getItem('og.titleSeen') !== '1'; } catch { return true; }
}

// The desk's wood and paper are painted once, before anything is drawn on them.
installDeskTextures();

export function App() {
  const [title, setTitle] = useState(titleWanted);
  const [storageReady, setStorageReady] = useState(false);
  const done = () => { try { sessionStorage.setItem('og.titleSeen', '1'); } catch { /* session only */ } setTitle(false); };
  return <>
    <AlwaysChrome />
    {storageReady
      ? <><ScreenContent />{title && <TitleSequence onDone={done} />}<Toast /><LoadingSave /></>
      : <FolderGate onReady={() => setStorageReady(true)} />}
  </>;
}

function LoadingSave() {
  const name = useGame(s => s.loadingSave);
  const cancel = useGame(s => s.cancelLoad);
  if (name == null) return null;
  return <DialogFrame title="Opening saved city" onClose={cancel} width={420}>
    <div className="paper sheet">
      <div className="body" role="status"><h2>Opening your city…</h2><p>{name}</p></div>
      <div className="foot"><button className="btn" onClick={cancel}>Cancel</button></div>
    </div>
  </DialogFrame>;
}

function ScreenContent() {
  const screen = useGame((s) => s.screen);
  const worldSession = useGame((s) => s.worldSession);

  switch (screen) {
    case 'newGame':
      return <NewGameScreen />;
    case 'game':
      return <GameScreen key={worldSession} />;
    case 'gameOver':
      return <GameOverScreen key={worldSession} />;
    default:
      return <MainMenu />;
  }
}
