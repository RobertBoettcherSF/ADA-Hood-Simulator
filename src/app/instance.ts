/**
 * 1.2.21: one game per browser tab. Each tab claims an instance tag with the
 * Web Locks API: the first tab is the primary instance (tag '') and keeps the
 * plain file names, so existing cities load as before; any further tab open at
 * the same time gets its own short tag, kept in sessionStorage so a reload
 * finds its own city again. The tag goes into the world file, the autosave and
 * every debug and Auto Test report name, so two tabs never overwrite each other.
 */
const KEY = 'hood.instance';
let tag = '';
let claimed = false;

/** `name` with this tab's tag before the extension: world.json → world-k3f9.json. */
export function instanceFile(name: string): string {
  if (!tag) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}-${tag}${name.slice(dot)}` : `${name}-${tag}`;
}

/** The autosave slot name for this tab. */
export function autosaveName(): string {
  return tag ? `Autosave ${tag}` : 'Autosave';
}

function stored(): string | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY); } catch { return null; }
}

function remember(t: string): void {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, t); } catch { /* private mode */ }
}

type Locks = { request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void): Promise<unknown> };

async function tryLock(locks: Locks, t: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    void locks.request(`hood-instance-${t || 'main'}`, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return; }
      resolve(true);
      // Held for the life of the tab.
      return new Promise<void>(() => {});
    }).catch(() => resolve(false));
  });
}

export async function claimInstance(): Promise<string> {
  if (claimed) return tag;
  claimed = true;
  const locks = typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: Locks }).locks : undefined;
  const previous = stored();
  if (!locks) { tag = previous ?? ''; return tag; }
  const candidates = [previous ?? '', ''];
  for (const t of candidates) if (await tryLock(locks, t)) { tag = t; remember(t); return tag; }
  for (let i = 0; i < 20; i++) {
    const t = Math.random().toString(36).slice(2, 6);
    if (await tryLock(locks, t)) { tag = t; remember(t); return tag; }
  }
  return tag;
}
