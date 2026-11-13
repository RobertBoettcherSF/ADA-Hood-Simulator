/**
 * 1.2.29: where the art lives. The art (pictures, city textures, models,
 * motions, music and sounds) is kept in its own repository and is optional:
 * with none present the game runs on placeholders drawn in code.
 *
 * ART_BASE is the one setting. Empty means "beside the game" (the build's
 * base: public/ when developing, play/ or dist/ when built), which is where
 * fetch-assets.sh puts the files. A build can point it elsewhere with
 * VITE_ART_BASE (a URL ending in "/"), e.g. a web address serving the asset
 * repository's files.
 */
const ART_BASE_SETTING = '';

export const ART_BASE: string = (import.meta.env?.VITE_ART_BASE as string | undefined) || ART_BASE_SETTING || (import.meta.env?.BASE_URL ?? '/');

/** The address of one art file, by its path in the asset repository (e.g. "art/ui/plaque.jpg"). */
export function artUrl(path: string): string {
  return `${ART_BASE}${path.replace(/^\/+/, '')}`;
}

let present: Promise<boolean> | null = null;
let known: boolean | null = null;

/** Whether the art is there: its manifest answers. Asked once per page. */
export function artPresent(): Promise<boolean> {
  if (!present) {
    present = typeof fetch === 'undefined'
      ? Promise.resolve(false)
      : fetch(artUrl('asset-manifest.json'), { cache: 'no-store' })
        .then((response) => response.ok && (response.headers.get('content-type') ?? '').includes('json'))
        .catch(() => false);
    present = present.then((yes) => { known = yes; return yes; });
  }
  return present;
}

/** True once the art is known to be missing (false while unknown or present). */
export function artMissing(): boolean {
  return known === false;
}
