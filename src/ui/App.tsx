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
import { ControlHelp } from './ControlHelp';
import { FolderGate } from './FolderGate';
import { LoadingReel } from './LoadingReel';
import { StreetLoading } from './StreetLoading';
import { markBootReady, markBootStart } from '../app/bootTiming';
import { useEffect, useState } from 'react';

/** The title plays once a session, and not under automated checks (?audit). */
function titleWanted(): boolean {
  if (typeof window === 'undefined' || /[?&](audit|notitle)/.test(window.location.search) || navigator.webdriver) return false;
  try { return sessionStorage.getItem('og.titleSeen') !== '1'; } catch { return true; }
}

// The desk's wood and paper are painted once, before anything is drawn on them.
installDeskTextures();

function openingReel(): 'play' | 'card' | 'off' {
  if (typeof window === 'undefined') return 'off';
  const query = window.location.search;
  if (/[?&](?:noreel|audit)(?:=|&|$)/.test(query)) return 'off';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'card';
  return 'play';
}

export function App() {
  const [title, setTitle] = useState(titleWanted);
  const [storageReady, setStorageReady] = useState(false);
  const [bootPercent, setBootPercent] = useState(8);
  const [reel, setReel] = useState(openingReel);
  const done = () => { try { sessionStorage.setItem('og.titleSeen', '1'); } catch { /* session only */ } setTitle(false); };
  if (typeof performance !== 'undefined') markBootStart();
  const finishBoot = () => {
    setBootPercent(100);
    markBootReady();
    setStorageReady(true);
  };
  useEffect(() => {
    if (!(storageReady && reel === 'card')) return;
    try { sessionStorage.setItem('og.titleSeen', '1'); } catch { /* session only */ }
    setTitle(false);
    setReel('off');
  }, [storageReady, reel]);
  const skipReel = () => {
    if (!storageReady) setReel('card');
    else { done(); setReel('off'); }
  };
  return <>
    <AlwaysChrome />
    <ControlHelp />
    <Toast />
    {!storageReady && (
      <div hidden={reel !== 'off'}>
        <FolderGate onReady={finishBoot} onProgress={setBootPercent} onChoice={() => { markBootReady(); setReel('off'); }} />
      </div>
    )}
    {storageReady && reel === 'off' && <>
      <ScreenContent />
      {title && <TitleSequence onDone={done} />}
      <LoadingSave />
    </>}
    {reel === 'play' && <LoadingReel percent={bootPercent} ready={storageReady} onSkip={skipReel} onFallback={() => setReel('card')} />}
    {reel === 'card' && !storageReady && (
      <StreetLoading message="The streets are being put in order." failed={false} percent={bootPercent} onRetry={() => {}} onExit={() => {}} />
    )}
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
