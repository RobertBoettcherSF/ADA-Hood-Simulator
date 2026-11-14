/**
 * The recovered vote tally for elections in the original 40 × 32 city: builds
 * the original's inputs (block contents, inner-cell occupiers, avenue and river
 * masks, four territory bitmaps, Teamsters weights, the two civic principals)
 * from the world and runs `originalElectionVotes`.
 *
 * Occupier roles follow 0x712D30's 26..31 gang-actor range: a gang-held
 * business is occupied by its manager (or the boss) as role 30, whose own-gang
 * hostility 0x4BDA70 suppresses; a private shopkeeper is role 15. Civic cells
 * are read through their manager if one is recorded, otherwise they have no
 * occupier. Evidence: docs/audit/2026-09-28/election-votes/review.md.
 */
import { fearOf, hostilityOf } from './attitudes';
import { fineGrid } from './originalBootstrap';
import {
  originalElectionVotes, originalTeamstersWeight, type Four, type GangSlot, type OriginalElectionCell,
  type OriginalElectionCity, type OriginalVoter, type OriginalVoteResult,
} from './originalElectionVotes';
import { BUILDING_BY_ID } from './data/buildings';
import type { Building, ID, Person, WorldState } from './types';
import { territoryBlocks } from './world';
import { standardRules } from './rules';

const GANG_OCCUPIER = 30, SHOPKEEPER = 15, GANG_MEMBER = 29;

function four<T>(f: (slot: number) => T): Four<T> { return [f(0), f(1), f(2), f(3)] as const; }

export function originalElectionCity(w: WorldState): OriginalElectionCity | null {
  // 1.2.51 (Robert): the Standard election on every city size. A Small or
  // Large city has no avenue rows or columns of its own (none are skipped).
  const layout = w.cityLayout?.original;
  if (!layout && !standardRules(w)) return null;
  const avenues = layout ? layout.avenues : { rows: [] as number[], cols: [] as number[] };
  const gangIds = Object.keys(w.gangs).map(Number);
  const slotOf = new Map<ID, GangSlot>(gangIds.slice(0, 4).map((id, i) => [id, i as GangSlot]));
  const voter = (p: Person | undefined | null, role: number, gangSlot: GangSlot | null): OriginalVoter | null =>
    p && p.status !== 'dead' ? {
      role, gangSlot,
      hostility: four(s => gangIds[s] == null ? 128 : hostilityOf(p, gangIds[s])),
      fear: four(s => gangIds[s] == null ? 128 : fearOf(p, gangIds[s])),
    } : null;
  const occupier = (b: Building, kind: number): OriginalVoter | null => {
    if (kind === 2 && b.ownerGangId != null) {
      const gang = w.gangs[b.ownerGangId];
      return voter(gang && w.people[gang.bossId], GANG_MEMBER, slotOf.get(b.ownerGangId) ?? null);
    }
    if (b.ownerGangId != null) {
      const gang = w.gangs[b.ownerGangId];
      const p = (b.managerId != null ? w.people[b.managerId] : null) ?? (gang ? w.people[gang.bossId] : null);
      return voter(p, GANG_OCCUPIER, slotOf.get(b.ownerGangId) ?? null);
    }
    if (kind === 8) return voter(b.managerId != null ? w.people[b.managerId] : null, SHOPKEEPER, null);
    return voter(b.ownerPersonId != null ? w.people[b.ownerPersonId] : null, SHOPKEEPER, null);
  };

  const { cells, FW } = fineGrid(w);
  const blocks = w.blocks.map(block => {
    const inner: OriginalElectionCell[] = [];
    for (let i = 0; i < 9; i++) {
      const c = cells[(block.gy * 5 + 1 + Math.floor(i / 3)) * FW + block.gx * 5 + 1 + i % 3];
      if (!c) continue;
      inner.push({ kind: c.cls, owner: occupier(c.building, c.cls), isMaster: c.master, hasOverlay: c.building.hidesId != null });
    }
    // Cell 6 in the original's column-major block is our top-left inner cell.
    const first = cells[(block.gy * 5 + 1) * FW + block.gx * 5 + 1];
    return { index: block.id, content: block.original?.content ?? 0, cells: inner,
      owner: first ? occupier(first.building, first.cls) : null };
  });

  const teamsters = four(s => {
    const gangId = gangIds[s];
    return originalTeamstersWeight(Object.values(w.buildings)
      .filter(b => b.typeId === 'teamsters' && b.state === 'trading' && b.ownerGangId === gangId && gangId != null)
      .map(b => ({ teamsters: true, tradeUnionFront: b.frontId != null && BUILDING_BY_ID[w.buildings[b.frontId]?.typeId]?.special === 'union' })));
  });
  const principals = w.election.candidates.filter(c => c.kind !== 'gang').slice(0, 2)
    .map(c => voter(w.people[c.id], SHOPKEEPER, null));
  const absent: OriginalVoter = { role: SHOPKEEPER, gangSlot: null, hostility: [255, 255, 255, 255], fear: [0, 0, 0, 0] };
  const standing = w.election.candidates
    .filter(c => c.kind === 'gang' && c.gangId != null && slotOf.has(c.gangId) && !w.gangs[c.gangId].eliminated)
    .map(c => slotOf.get(c.gangId!)!);
  return {
    width: w.gridW, height: w.gridH, blocks,
    avenueRows: avenues.rows, avenueColumns: avenues.cols,
    riverBlocks: w.blocks.filter(b => b.layout?.use === 'water').map(b => b.id),
    territories: four(s => gangIds[s] == null ? [] : territoryBlocks(w, gangIds[s]).map(b => b.id)),
    teamstersWeights: teamsters,
    principals: [principals[0] ?? absent, principals[1] ?? absent],
    standingGangSlots: standing,
  };
}

/**
 * Poll the current ballot with the Standard rules. Returns each candidate's
 * percentage in ballot order, or null for a game not on the Standard rules.
 */
export function originalElectionPoll(w: WorldState): { votes: Map<ID, number>; result: OriginalVoteResult } | null {
  const city = originalElectionCity(w);
  if (!city) return null;
  const result = originalElectionVotes(city);
  const votes = new Map<ID, number>();
  const civic = w.election.candidates.filter(c => c.kind !== 'gang').slice(0, 2);
  civic.forEach((c, i) => votes.set(c.id, result.percentages[i]));
  city.standingGangSlots.forEach((slot, i) => {
    const c = w.election.candidates.find(k => k.kind === 'gang' && k.gangId === Object.keys(w.gangs).map(Number)[slot]);
    if (c) votes.set(c.id, result.percentages[2 + i]);
  });
  return { votes, result };
}


/** 1.2.50: a gang's slot in the Standard election count (the first four gangs), or null. */
export function originalElectionSlot(w: WorldState, gangId: ID): GangSlot | null {
  const i = Object.keys(w.gangs).map(Number).slice(0, 4).indexOf(gangId);
  return i < 0 ? null : i as GangSlot;
}
