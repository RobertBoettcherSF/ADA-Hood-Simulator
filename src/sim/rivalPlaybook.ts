/**
 * Extra orders on top of the ordinary rival planner, from a playbook copied
 * into the city at creation. The ordinary planner still runs first and still
 * uses the city's random stream. These extras use their own stream, so a city
 * with no playbook is unchanged.
 */
import { BUY_REACH_BLOCKS, issueOrder, nearTerritory } from './api';
import { BUILDING_BY_ID } from './data/buildings';
import { buildingList } from './entityLists';
import { isValidAreaTarget } from './execution';
import { Rng } from './rng';
import type { Gang, RivalPlaybook, WorldState } from './types';
import { gangManpower, teamsOf } from './world';

/** Added to one weight. Small on purpose: difficulty tuning comes later. */
const BIAS = 0.08;

type SpendKey = RivalPlaybook['priority'][number];

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function biasedWeights(w: WorldState, gang: Gang, book: RivalPlaybook): Record<SpendKey, number> {
  const weights = { ...book.weights };
  const rivals = Object.values(w.gangs).filter((other) => !other.isPlayer).sort((a, b) => a.id - b.id);
  const index = rivals.findIndex((other) => other.id === gang.id);
  const key: SpendKey = index === 0 ? 'violence' : index === 1 ? 'bribes' : 'rackets';
  weights[key] = clamp(weights[key] + BIAS);
  return weights;
}

/** One extra pass. Failures are ignored: the crew may already be booked. */
export function applyRivalPlaybook(w: WorldState, gang: Gang): void {
  const book = w.rivalPlaybook;
  if (!book || gang.isPlayer || gang.eliminated) return;
  const weights = biasedWeights(w, gang, book);
  const rng = new Rng((w.options.seed + w.week * 997 + gang.id * 13) >>> 0);
  const team = teamsOf(w, gang).find((crew) => {
    const lieutenant = w.people[crew.lieutenantId];
    return lieutenant && lieutenant.status !== 'dead' && lieutenant.status !== 'jailed' && lieutenant.status !== 'kidnapped';
  });
  if (!team) return;
  const queued = new Set(Object.values(w.orders).filter((order) => order.gangId === gang.id).map((order) => order.type));
  const sites = buildingList(w);

  for (const key of book.priority) {
    const weight = weights[key];
    if (key === 'hiring' && weight >= 0.35 && !queued.has('recruit') && gangManpower(w, gang) < Math.round(4 + weight * 16)) {
      const hoods = sites.filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed');
      if (hoods.length) {
        issueOrder(w, gang.id, { teamId: team.id, type: 'recruit', buildingIds: hoods.slice(0, Math.max(1, Math.round(weight * 2))).map((b) => b.id), opts: { manpower: 1 } });
        queued.add('recruit');
      }
    }
    if (key === 'rackets' && weight >= 0.35 && !queued.has('extort')) {
      const extort = sites.filter((b) => isValidAreaTarget(w, gang.id, 'extort', b));
      const take = Math.max(1, Math.round(weight * 3));
      if (extort.length) {
        issueOrder(w, gang.id, { teamId: team.id, type: 'extort', buildingIds: extort.slice(0, take).map((b) => b.id), opts: { manpower: 1 } });
        queued.add('extort');
      }
    }
    if (key === 'bribes' && weight >= 0.35 && !queued.has('bribe') && gang.cash > 3000) {
      const chief = w.people[w.policeChiefId];
      if (chief && chief.status === 'active' && chief.bribedBy !== gang.id) {
        issueOrder(w, gang.id, { teamId: team.id, type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: Math.round(200 + weight * 800) } });
        queued.add('bribe');
      }
    }
    if (key === 'buying' && weight >= 0.35 && !queued.has('buyPremises') && gang.cash > 12000) {
      const site = sites.find((b) => {
        const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
        return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * weight * 0.5 && nearTerritory(w, gang.id, b.blockId, BUY_REACH_BLOCKS);
      });
      if (site) {
        issueOrder(w, gang.id, { teamId: team.id, type: 'buyPremises', buildingIds: [site.id] });
        queued.add('buyPremises');
      }
    }
    if (key === 'violence' && weight >= 0.45 && !queued.has('smashUp')) {
      const enemies = sites.filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading');
      if (enemies.length) {
        const target = rng.pick(enemies);
        issueOrder(w, gang.id, { teamId: team.id, type: 'smashUp', buildingIds: [target.id], opts: { manpower: 2 } });
        queued.add('smashUp');
      }
    }
  }
}
