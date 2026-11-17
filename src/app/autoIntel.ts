/**
 * 1.2.69 (Robert, point 1): Auto knows only what a player can know. A rival's
 * strength is read from the Graphs chart (the last GRAPH_WEEKS weekly entries
 * every gang records) and our map — never from the live headcount.
 */
import { buildingMapIntel } from '../sim/mapIntel';
import { memberLosses } from '../sim/memberLosses';
import type { Building, Gang, Person, WorldState } from '../sim/types';

/** The weeks the Graphs chart shows. */
export const GRAPH_WEEKS = 8;

export interface RivalIntel {
  gang: Gang;
  /** Manpower as the chart last showed it (men + managers). */
  chartMen: number;
  /** Power and assets as the chart last showed them. */
  chartPower: number;
  chartAssets: number;
  /** Rival businesses our map shows (not the HQ, not destroyed). */
  knownBiz: Building[];
  /** Street men: chart Manpower − the managers (1.2.70, point 6). */
  street: number;
  /** 1.2.70 (Robert, point 6): managers = min(known businesses, chart Manpower − known men). */
  managers: number;
  /** 1.2.70 (Robert, point 14): the chart's entries; under 2 there is nothing to compare. */
  entries: number;
  /** Recruits a week: the chart's weekly change + our kills of the gang, over the chart's weeks. */
  recruitsPW: number;
  /** Lieutenants and hoods of the gang we have identified. */
  knownMen: Person[];
}

const chart = (g: Gang) => g.history.slice(-GRAPH_WEEKS);

export function rivalIntel(w: WorldState, us: Gang, g: Gang): RivalIntel {
  const pts = chart(g);
  const last = pts.at(-1);
  const chartMen = last?.manpower ?? 0;
  const knownBiz = Object.values(w.buildings).filter((b) => { if (b.state === 'destroyed' || b.typeId === 'office' || b.cls === 'empty') return false; const i = buildingMapIntel(b, us.id); return i.ownerGangId === g.id && !i.isHQ; });
  let recruitsPW = 0;
  if (pts.length >= 2) {
    const first = pts[0];
    const ourKills = memberLosses(w, g.id, first.week).filter((l) => l.week > first.week && l.week <= last!.week && l.by === us.name).length;
    recruitsPW = Math.max(0, (chartMen - first.manpower + ourKills) / (last!.week - first.week || 1));
  }
  const knownMen = us.knownPeople.map((id) => w.people[id]).filter((p): p is Person => !!p && p.gangId === g.id && p.status !== 'dead' && (p.role === 'hood' || p.role === 'lieutenant'));
  // 1.2.70 (Robert, point 6): a business need not have a manager — managers are
  // at most the known businesses and at most the chart's men we cannot name.
  const managers = Math.min(knownBiz.length, Math.max(0, chartMen - knownMen.length));
  const street = Math.max(0, chartMen - managers);
  return { gang: g, chartMen, chartPower: last?.power ?? 0, chartAssets: last?.assets ?? 0, knownBiz, street, managers, entries: pts.length, recruitsPW, knownMen };
}
