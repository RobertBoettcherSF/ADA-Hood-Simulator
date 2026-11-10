import { BUILDING_BY_ID } from './data/buildings';
import { NEWSPAPER_NAMES } from './data/names';
import type { Building, ID, NewsItem, Vec2, WorldState } from './types';
import { dist2 } from './world';
import { buildingList } from './entityLists';

export function publishingNewspapers(w: WorldState): Building[] {
  return buildingList(w).filter(b => BUILDING_BY_ID[b.typeId]?.special === 'newspaper' &&
    b.state === 'trading' && b.fbiClosedWeek == null && !!w.lots[b.lotId]);
}

export function closestNewspaper(w: WorldState, pos: Vec2, papers = publishingNewspapers(w)): Building | null {
  return papers.slice().sort((a, b) => dist2(w.lots[a.lotId].center, pos) -
    dist2(w.lots[b.lotId].center, pos) || a.id - b.id)[0] ?? null;
}

/** Manual p.53: the nearest owned paper takes precedence over the nearest paper. */
export function deliveredNewspaper(w: WorldState, gangId: ID): Building | null {
  const gang = w.gangs[gangId];
  if (!gang) return null;
  const office = buildingList(w).find(b => b.ownerGangId === gangId && b.isHQ);
  const pos = (office && w.lots[office.lotId]?.center) ?? w.people[gang.bossId]?.pos;
  if (!pos) return null;
  const papers = publishingNewspapers(w), owned = papers.filter(b => b.ownerGangId === gangId);
  return closestNewspaper(w, pos, owned.length ? owned : papers);
}

export function newspaperNameIndex(w: WorldState, paper: Building): number {
  const named = NEWSPAPER_NAMES.indexOf(paper.paperName ?? '');
  if (named >= 0) return named;
  // Older saves did not declare the name; retain a stable corner-based masthead.
  const block = w.blocks[paper.blockId];
  return (block.gx >= Math.floor(w.gridW / 2) ? 1 : 0) + (block.gy >= Math.floor(w.gridH / 2) ? 2 : 0);
}

/** Publish only the named legal holding, never the front's hidden business or
 * the owner's other territory. Manual p.53's purchase secrecy implies this
 * information advantage; publication at settlement is the remake's timing. */
export function publishBusinessIntelligence(w: WorldState): void {
  const readers = Object.values(w.gangs).filter(g => !g.eliminated)
    .map(g => ({ gangId: g.id, paper: deliveredNewspaper(w, g.id) })).filter(r => r.paper != null);
  for (const item of w.news) {
    if (item.week !== w.week || !['purchase', 'opening'].includes(item.kind ?? '') || item.buildingId == null || item.gangId == null) continue;
    const building = w.buildings[item.buildingId];
    if (!building || building.cls === 'illegal' || building.cls === 'empty' || building.ownerGangId !== item.gangId) continue;
    for (const reader of readers) {
      if (item.paperOwnerId != null && reader.paper!.ownerGangId !== item.paperOwnerId) continue;
      (building.reportedOwners ??= {})[reader.gangId] = item.gangId;
      building.knowledge[reader.gangId] = Math.max(building.knowledge[reader.gangId] ?? 0, 1);
    }
  }
}

/** The exact editorial ranking is remake policy. Election results outrank
 * major civic/gang events, which outrank the routine weekly lead. */
export function newspaperLead(items: NewsItem[]): NewsItem | null {
  let lead: NewsItem | null = null, priority = 0;
  for (const item of items) {
    const rank = item.frontPagePriority ?? (item.section === 'front' ? 1 : 0);
    if (rank > 0 && rank >= priority) { lead = item; priority = rank; }
  }
  return lead;
}

/** Editions contain the completed week, never unfinished orders or private gang logs. */
export function newspaperEdition(w: WorldState, gangId: ID): { paper: Building | null; week: number; items: NewsItem[] } {
  const paper = deliveredNewspaper(w, gangId), week = Math.max(0, w.week - 1);
  const items = paper ? w.news.filter(n => n.week === week &&
    (n.paperOwnerId == null || paper.ownerGangId === n.paperOwnerId)) : [];
  if (paper && week === 0 && !items.some(n => n.section === 'front')) items.unshift({
    week, section: 'front', photo: 'calm', headline: 'WELCOME TO NEW TEMPERANCE',
    body: 'A new week begins in New Temperance. Business owners open their doors as the city prepares for another working week.',
    gangId: null,
  });
  return { paper, week, items };
}
