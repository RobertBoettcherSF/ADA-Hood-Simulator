import { artPresent, artUrl } from '../app/artBase';

/**
 * 1.2.29: placeholder art drawn in code. With no art present every picture
 * the page asks for comes back as a plain shape (a silhouette for a
 * portrait, a disc for an icon, a framed box for everything else), the
 * desk's leather and paper keep their flat colours, the city keeps its
 * painted textures and simple figures, and there is no recorded sound.
 */
const svg = (body: string, w = 64, h = 64) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`;

const PORTRAIT = svg('<rect width="64" height="64" fill="#cbb994"/><circle cx="32" cy="24" r="12" fill="#5b4a36"/><path d="M10 64c2-16 12-22 22-22s20 6 22 22z" fill="#5b4a36"/>');
const ICON = svg('<circle cx="32" cy="32" r="22" fill="#5b4a36"/>');
const CREST = svg('<path d="M12 8h40v24c0 14-10 22-20 26C22 54 12 46 12 32z" fill="#6d5a40" stroke="#2b2118" stroke-width="3"/>');
const BOX = svg('<rect x="2" y="2" width="60" height="44" fill="#d8ccb0" stroke="#5b4a36" stroke-width="3"/><path d="M2 46L24 22l14 14 10-8 14 18" fill="none" stroke="#8a7656" stroke-width="3"/>', 64, 48);

/** The placeholder for an art file, by where it sits in the art folders. */
export function placeholderFor(src: string): string {
  if (/\/art\/portraits\//.test(src)) return PORTRAIT;
  if (/\/art\/icons(-small)?\//.test(src)) return ICON;
  if (/\/art\/crests\//.test(src)) return CREST;
  return BOX;
}

/** CSS backgrounds that come from art files; set only when the art is there. */
const CSS_ART: Record<string, string> = {
  '--art-key-art': 'art/brand/key-art.jpg',
  '--art-key-art-city': 'art/brand/key-art-city.jpg',
  '--art-menu-casino': 'art/ui/menu-casino.jpg',
  '--art-newgame-desk': 'art/ui/newgame-desk.jpg',
  '--art-plaque': 'art/ui/plaque.jpg',
  '--art-leather-oxblood': 'art/ui/leather-oxblood.jpg',
  '--art-page-blank': 'art/ui/page-blank.jpg',
};

let installed = false;

/** Swap any art picture that fails to load for its placeholder, and give CSS the art when it is there. */
export function installArtPlaceholders(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.artPlaceholder === '1') return;
    if (!/\/art\//.test(img.currentSrc || img.src)) return;
    img.dataset.artPlaceholder = '1';
    img.src = placeholderFor(img.currentSrc || img.src);
  }, true);
  void artPresent().then((yes) => {
    if (!yes) return;
    const root = document.documentElement.style;
    for (const [name, path] of Object.entries(CSS_ART)) root.setProperty(name, `url("${artUrl(path)}")`);
  });
}
