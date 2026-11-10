/**
 * The boss's heritage and face: the original's face editor chose gender,
 * nationality and facial traits. Here a heritage picks a set of painted
 * sitters (public/art/portraits/nationality/<heritage>/, required-image-assets
 * P3b): twelve men and six women, the same trait grid in every heritage, and
 * the face arrows step through them as the original's head buttons did.
 * It has no effect on play, as in the original.
 */
export type Heritage =
  | 'african-american' | 'anglo' | 'chinese' | 'german' | 'greek' | 'irish' | 'italian' | 'jewish'
  | 'mexican' | 'polish';

export const MALE_SITTERS = 12;
export const FEMALE_SITTERS = 6;

/** What each slot of the grid shows, the same in every heritage. */
export const MALE_SITTER_TRAITS = [
  'Young · fedora', 'Young · flat cap', 'Young · bare-headed', 'Young · moustache',
  'Moustache · fedora', 'Spectacles · hat', 'Middle-aged · bare-headed', 'Middle-aged · flat cap',
  'Spectacles · bare-headed', 'Older · fedora', 'Elderly', 'Elderly · bald',
] as const;
export const FEMALE_SITTER_TRAITS = [
  'Young · cloche', 'Young · waved hair', 'Spectacles · cloche', 'Bare-headed', 'Small hat', 'Elderly · spectacles',
] as const;

export const HERITAGES: readonly { id: Heritage; label: string; male: string[]; female: string[]; surnames: string[] }[] = [
  { id: 'african-american', label: 'African American', male: ['Clarence', 'Amos', 'Floyd'], female: ['Pearl', 'Bessie', 'Hazel'], surnames: ['Washington', 'Jefferson', 'Coleman'] },
  { id: 'anglo', label: 'Anglo-American', male: ['Walter', 'Clarence', 'Chester'], female: ['Dorothy', 'Mildred'], surnames: ['Whitaker', 'Carmichael', 'Pemberton'] },
  { id: 'chinese', label: 'Chinese', male: ['Henry', 'Walter', 'Eddie'], female: ['Mae', 'Lillian'], surnames: ['Lee', 'Wong', 'Chin'] },
  { id: 'german', label: 'German', male: ['Otto', 'Heinrich', 'Ludwig', 'Fritz', 'Hans', 'Karl', 'Werner', 'Max', 'Franz', 'Wilhelm'], female: ['Greta', 'Hilde', 'Ilse', 'Frieda', 'Marta', 'Klara'], surnames: ['Schmidt', 'Keller', 'Bauer', 'Wagner', 'Weber', 'Hoffmann', 'Kruger', 'Fischer'] },
  { id: 'greek', label: 'Greek', male: ['Nikos', 'Kostas', 'Yannis'], female: ['Eleni', 'Sophia'], surnames: ['Papadakis', 'Stavros', 'Kostas'] },
  { id: 'irish', label: 'Irish', male: ['Declan', 'Brendan', 'Mickey', 'Fergus'], female: ['Bridget', 'Maureen', 'Nora'], surnames: ['Doyle', 'Flanagan', 'Maguire', 'OConnell', 'Sullivan'] },
  { id: 'italian', label: 'Italian', male: ['Salvatore', 'Rocco', 'Carmine', 'Vito', 'Angelo', 'Enzo', 'Luigi', 'Marco', 'Paolo', 'Domenico'], female: ['Concetta', 'Rosa', 'Carmela', 'Lucia', 'Gina'], surnames: ['Moretti', 'Rinaldi', 'Ferrante', 'Vanetti', 'Corvino', 'Bellini', 'Marchetti', 'Ricci', 'Costa'] },
  { id: 'jewish', label: 'Jewish', male: ['Meyer', 'Abe', 'Solly', 'Moe'], female: ['Esther', 'Sadie', 'Ruth'], surnames: ['Rosenberg', 'Kaplan', 'Shapiro', 'Weiss'] },
  { id: 'mexican', label: 'Mexican', male: ['Miguel', 'Rafael', 'Ernesto'], female: ['Guadalupe', 'Rosa', 'Elena'], surnames: ['Delgado', 'Ramirez', 'Castillo'] },
  { id: 'polish', label: 'Polish', male: ['Stefan', 'Anton', 'Kazimierz'], female: ['Wanda', 'Halina'], surnames: ['Kowalski', 'Nowak', 'Zielinski'] },
];

export const HERITAGE_BY_ID = Object.fromEntries(HERITAGES.map(h => [h.id, h])) as Record<Heritage, (typeof HERITAGES)[number]>;

/** How many sitters a heritage has for a bearing. */
export const sitterCount = (female: boolean) => female ? FEMALE_SITTERS : MALE_SITTERS;

/** The portrait key under portraits/nationality/, e.g. `italian/m-07`; `sitter` wraps. */
export function bossFace(heritage: Heritage, female: boolean, sitter: number): string {
  const n = sitterCount(female), i = ((Math.floor(sitter) % n) + n) % n;
  return `${heritage}/${female ? 'f' : 'm'}-${String(i + 1).padStart(2, '0')}`;
}

/** The traits a sitter shows, for the Change Details caption. */
export function sitterTraits(female: boolean, sitter: number): string {
  const list = female ? FEMALE_SITTER_TRAITS : MALE_SITTER_TRAITS, n = list.length;
  return list[((Math.floor(sitter) % n) + n) % n];
}

/** A rival boss's heritage from the gang's surname, when it has one. */
export function heritageOfSurname(surname: string): Heritage | null {
  return HERITAGES.find(h => h.surnames.includes(surname))?.id ?? null;
}

/**
 * A first name and a surname from one heritage. Two draws, the same as the
 * old mixed pools, so the rest of the city's random stream stays in step.
 */
export function heritageName(rng: { pick<T>(arr: readonly T[]): T }, female: boolean, id: Heritage): string {
  const h = HERITAGE_BY_ID[id];
  const firsts = female ? h.female : h.male;
  return `${rng.pick(firsts)} ${rng.pick(h.surnames)}`;
}

/**
 * A recruit from the city's mix, weighted toward `prefer`. One heritage for
 * both names. Two draws, matching the unweighted name.
 */
export function mixedHeritageName(
  rng: { weighted<T>(entries: readonly { item: T; weight: number }[]): T; int(min: number, max: number): number },
  female: boolean,
  prefer: Heritage,
): { name: string; heritage: Heritage } {
  const heritage = rng.weighted(HERITAGES.map((h) => ({ item: h.id, weight: h.id === prefer ? 12 : 1 })));
  const h = HERITAGE_BY_ID[heritage];
  const firsts = female ? h.female : h.male;
  const slot = rng.int(0, firsts.length * h.surnames.length - 1);
  return { name: `${firsts[slot % firsts.length]} ${h.surnames[Math.floor(slot / firsts.length)]}`, heritage };
}

/** The heritage that contains both this first name and this surname, if there is one. */
export function nameOrigin(name: string): Heritage | null {
  const plain = name.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (plain.length < 2) return null;
  const first = plain[0];
  const last = plain[plain.length - 1];
  return HERITAGES.find((h) => (h.male.includes(first) || h.female.includes(first)) && h.surnames.includes(last))?.id ?? null;
}

/** A stable sitter from a number, without touching the world's random stream. */
export function sitterFromSeed(seed: number): number {
  let h = (seed * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  return h % 1024;
}
