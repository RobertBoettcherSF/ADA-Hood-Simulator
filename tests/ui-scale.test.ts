import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyUiScale, fittedUiScale, readUiScale, uiScaleAvailable, writeUiScale } from '../src/app/uiScale';
import { flushLocalData, loadLocalData } from '../src/app/localData';
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

afterEach(() => { attachWorldStore(null); vi.unstubAllGlobals(); });

describe('interface scale', () => {
  it('is kept in the world folder, and ignores values it does not offer', async () => {
    const store = memoryStore();
    attachWorldStore(store);
    expect(readUiScale()).toBe(1);
    writeUiScale(1.25);
    await flushLocalData();
    await loadLocalData();
    expect(readUiScale()).toBe(1.25);
    await store.write('prefs.json', JSON.stringify({ uiScale: 1.3 }));
    await loadLocalData();
    expect(readUiScale()).toBe(1);
    await store.write('prefs.json', JSON.stringify({ uiScale: 'huge' }));
    await loadLocalData();
    expect(readUiScale()).toBe(1);
  });

  it('never enlarges past the room of the smallest window the layout is drawn for', () => {
    expect(fittedUiScale(2, 3840, 2160)).toBe(2);
    expect(fittedUiScale(2, 1920, 1080)).toBe(1.65);
    expect(fittedUiScale(1.25, 1280, 800)).toBe(1.25);
    expect(fittedUiScale(1.5, 1024, 640)).toBe(1);
    expect(fittedUiScale(0.75, 1024, 640)).toBe(0.75);
  });

  it('applies the scale on the page', () => {
    const style = { zoom: '' };
    vi.stubGlobal('document', { documentElement: { style } });
    vi.stubGlobal('window', { innerWidth: 1920, innerHeight: 1080 });
    expect(uiScaleAvailable()).toBe(true);
    expect(applyUiScale(1.5)).toBe(1.5);
    expect(style.zoom).toBe('1.5');
    expect(applyUiScale(0.9)).toBe(0.9);
    expect(style.zoom).toBe('0.9');
  });
});
