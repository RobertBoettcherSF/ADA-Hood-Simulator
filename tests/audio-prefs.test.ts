import { afterEach, describe, expect, it } from 'vitest';
import { audio } from '../src/audio/audio';
import { flushLocalData, loadLocalData, readLocalData } from '../src/app/localData';
import { attachWorldStore, type WorldStore } from '../src/app/worldFolder';

function memoryStore(): WorldStore {
  const files = new Map<string, string>();
  return {
    kind: 'indexeddb',
    label: 'test',
    read: async (name) => files.get(name) ?? null,
    write: async (name, body) => { files.set(name, body); },
    readBytes: async () => null,
    writeBytes: async () => {},
    writeReport: async () => {},
    exists: async (name) => files.has(name),
  };
}

afterEach(() => { attachWorldStore(null); });

describe('sound settings', () => {
  it('are kept in the world folder, with the music switches', async () => {
    attachWorldStore(memoryStore());
    expect([audio.musicVolume, audio.sfxVolume, audio.menuMusic, audio.gameMusic]).toEqual([0.35, 0.5, true, true]);
    audio.setMusicVolume(0.8);
    audio.setSfxVolume(0.1);
    audio.setMusicPlaces({ menuMusic: false });
    await flushLocalData();
    audio.loadStored();
    expect([readLocalData().audio.music, readLocalData().audio.sfx, readLocalData().audio.menuMusic, readLocalData().audio.gameMusic]).toEqual([0.8, 0.1, false, true]);
    await loadLocalData();
    expect([readLocalData().audio.music, readLocalData().audio.sfx, readLocalData().audio.menuMusic]).toEqual([0.8, 0.1, false]);
  });

  it('ignore damaged or out-of-range values', async () => {
    const store = memoryStore();
    attachWorldStore(store);
    await store.write('prefs.json', '{"audio":{"music":7,"sfx":"loud","menuMusic":1}}');
    await loadLocalData();
    const saved = readLocalData().audio;
    expect([saved.music, saved.sfx, saved.menuMusic]).toEqual([0.35, 0.5, true]);
  });
});
