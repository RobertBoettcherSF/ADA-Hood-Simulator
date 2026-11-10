import { useEffect, useRef, useState } from 'react';
import {
  directoryPickerAvailable,
  exportWorldFile,
  importWorldFile,
  pickDirectory,
  refreshCityOnFile,
  resumeDirectoryAfterGesture,
  resumeWorldStore,
  usePrivateStorage,
  activeWorldStore,
} from '../app/worldFolder';

/** Ask where the one living city is kept before the desk opens. */
export function FolderGate({ onReady }: { onReady: () => void }) {
  const [error, setError] = useState('');
  const [needsGesture, setNeedsGesture] = useState(false);
  const [busy, setBusy] = useState(true);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    let cancel = false;
    void resumeWorldStore().then((result) => {
      if (cancel) return;
      if (result && result !== 'needs-gesture') {
        void refreshCityOnFile().then(() => readyRef.current());
        return;
      }
      setNeedsGesture(result === 'needs-gesture');
      setBusy(false);
    }).catch((reason: unknown) => {
      if (cancel) return;
      setError(reason instanceof Error ? reason.message : 'Storage could not be opened.');
      setBusy(false);
    });
    return () => { cancel = true; };
  }, []);

  const ready = async (run: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await run();
      await refreshCityOnFile();
      onReady();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setBusy(false);
        return;
      }
      setError(reason instanceof Error ? reason.message : 'That folder could not be used.');
      setBusy(false);
    }
  };

  if (busy && !error) {
    return <main className="folder-gate"><p>Opening the place this city is kept…</p></main>;
  }

  return (
    <main className="folder-gate">
      <h1>Where should this city live?</h1>
      <p>
        One folder holds one city. The game keeps writing that city as you play.
        {directoryPickerAvailable()
          ? ' On this browser you can pick a folder on your computer.'
          : ' This browser will keep the city privately, and you can export it as a file.'}
      </p>
      {needsGesture && (
        <button type="button" className="folder-choice" onClick={() => void ready(() => resumeDirectoryAfterGesture().then((store) => {
          if (!store) throw new Error('Permission for the folder was not granted.');
        }))}>
          Continue in the folder you chose
        </button>
      )}
      {directoryPickerAvailable() && (
        <button type="button" className="folder-choice" onClick={() => void ready(() => pickDirectory())}>
          Choose a folder
        </button>
      )}
      <button type="button" className="folder-choice" onClick={() => void ready(() => usePrivateStorage())}>
        Keep it in this browser
      </button>
      <label className="folder-choice file">
        Import a world file
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void ready(async () => {
              if (!activeWorldStore()) await usePrivateStorage();
              await importWorldFile(file);
            });
          }}
        />
      </label>
      {activeWorldStore() && (
        <button type="button" className="folder-choice" onClick={() => void exportWorldFile().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Export failed.'))}>
          Export the city
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
