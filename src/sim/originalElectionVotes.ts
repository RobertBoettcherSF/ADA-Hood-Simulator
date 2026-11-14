/** The recovered original vote calculation (0x4BC1D0 / 0x4BC3F0 and helpers).
 * Raw block kinds, four gang slots and hostility/fear bytes are intentional.
 * `src/sim/originalElection.ts` adapts the original 40 × 32 world to it;
 * the civic floor is not scaled and compact cities keep the remake tally.
 * Evidence: docs/audit/2026-09-28/election-votes/review.md. */
export type Four<T> = readonly [T, T, T, T];
export type GangSlot = 0 | 1 | 2 | 3;
export interface OriginalVoter {
  /** Original actor role byte; 0x712D30 tests 26..31, even without a gang link. */
  role: number;
  hostility: Four<number>;
  fear: Four<number>;
  /** Resolved owning gang for the actor, including a manager's gang. */
  gangSlot: GangSlot | null;
}
export interface OriginalVoteBlock {
  /** Offset in the original width * height row-major block grid. */
  index: number;
  content: number;
  /** The owner of cell[6], used by the single-business support pool. */
  owner: OriginalVoter | null;
  /** The inner 3 by 3 cells visited by 0x4BDA70. */
  cells: readonly OriginalElectionCell[];
}
export interface OriginalElectionCell {
  kind: number;
  owner: OriginalVoter | null;
  /** Result of the kind-specific anchor lookup matching this cell's coordinates. */
  isMaster: boolean;
  /** Non-null virtual +0x11C link; kinds3/9 are skipped when this is present. */
  hasOverlay: boolean;
}
export interface OriginalElectionCity {
  width: number;
  height: number;
  blocks: readonly OriginalVoteBlock[];
  /** Coordinate masks from the original city avenue/river data. */
  avenueRows: readonly number[];
  avenueColumns: readonly number[];
  riverBlocks: readonly number[];
  territories: Four<readonly number[]>;
  teamstersWeights: Four<0 | 1 | 3>;
  principals: readonly [OriginalVoter, OriginalVoter];
  /** Ballot order can differ from gang-slot order. */
  standingGangSlots: readonly GangSlot[];
}
export interface OriginalVoteResult {
  /** Two principals, then standing gangs in ballot order, then unused zero slots. */
  percentages: number[];
  /** Multi-candidate counts before percentage normalization; absent for two-way. */
  scores: number[] | null;
  civicBlocks: number;
  civicPool: number;
  unionQuotas: number[];
  unionTransferred: number[][];
  support: number[][];
}

/** 0x5A4400, with the temporary self-hostility zero used by 0x4BDA70. */
export function originalEffectiveHostility(voter: OriginalVoter, slot: GangSlot, suppressSelf = false): number {
  const hostility = suppressSelf && voter.gangSlot === slot ? 0 : voter.hostility[slot];
  return Math.trunc((hostility - voter.fear[slot] + 256) / 2);
}

/** 0x4BD890 scans the gang's operations. No stacking or rival guard branch. */
export function originalTeamstersWeight(operations: readonly { teamsters: boolean; tradeUnionFront: boolean }[]): 0 | 1 | 3 {
  let weight: 0 | 1 | 3 = 0;
  for (const operation of operations) {
    if (!operation.teamsters) continue;
    if (operation.tradeUnionFront) return 3;
    weight = 1;
  }
  return weight;
}

/** 0x4BC9C0: block zero, parks, avenues and the supplied river path are removed. */
export function originalCivicBlocks(city: OriginalElectionCity, claimed: ReadonlySet<number>): number[] {
  const rows = new Set(city.avenueRows), columns = new Set(city.avenueColumns), river = new Set(city.riverBlocks);
  return city.blocks.filter(block => {
    const kind = block.content;
    return !claimed.has(block.index) && kind !== 0 && !(kind >= 25 && kind <= 33) && !(kind >= 62 && kind <= 67) &&
      !rows.has(Math.trunc(block.index / city.width)) && !columns.has(block.index % city.width) && !river.has(block.index);
  }).map(block => block.index);
}

/**
 * One block's average voter value toward a gang (0 = friendliest; under 64
 * the block is kept, 64–163 reluctant, 164+ lost), or null for the special
 * kinds that are always kept. 1.2.50: exported for Auto's campaign.
 */
export function originalBlockVoterAverage(block: OriginalVoteBlock, slot: GangSlot): number | null {
  if ([4, 7, 9, 11, 12, 13, 14].includes(block.content)) return null;
  let count = 0, sum = 0;
  for (const cell of block.cells) {
    const p = cell.owner;
    if (!p) continue;
    if (cell.kind === 3 || cell.kind === 9) { if (cell.hasOverlay) continue; }
    else if (cell.kind === 6 || cell.kind === 7 || cell.kind === 8) { if (!cell.isMaster) continue; }
    else if (cell.kind !== 2) continue;
    // Kind8 reads its occupier directly. It does NOT zero self-hostility.
    const suppressSelf = cell.kind !== 8 && (cell.kind === 2 || p.role === 28 || p.role === 30);
    sum += originalEffectiveHostility(p, slot, suppressSelf);
    count++;
  }
  return count ? Math.trunc(sum / count) : 0;
}

/** 0x4BDA70 consumes one gang's expanded bitmap. Special kinds bypass rejection:
 * their effective-hostility return is discarded at 0x4BE093, not accumulated. */
export function originalGangSupport(city: OriginalElectionCity, territory: ReadonlySet<number>, slot: GangSlot): number[] {
  const kept: number[] = [], reluctant: number[] = [];
  let reluctantSum = 0;
  for (const block of city.blocks) {
    if (!territory.has(block.index)) continue;
    const average = originalBlockVoterAverage(block, slot);
    if (average == null) {
      kept.push(block.index);
      continue;
    }
    if (average < 64) kept.push(block.index);
    else if (average < 164) {
      reluctant.push(block.index);
      reluctantSum += average;
    }
  }
  const average = reluctant.length ? Math.trunc(reluctantSum / reluctant.length) : 0;
  const quota = Math.trunc((164 - average) * reluctant.length / 100);
  // The allocation helper uses y-major order; this final retention uses x-major.
  reluctant.sort((a, b) => (a % city.width) - (b % city.width) || Math.trunc(a / city.width) - Math.trunc(b / city.width));
  kept.push(...reluctant.slice(0, quota));
  return kept.sort((a, b) => a - b);
}

/** 0x4BC1D0 and 0x4BC3F0. No RNG, physical pedestrian counts or campaign budget. */
export function originalElectionVotes(city: OriginalElectionCity): OriginalVoteResult {
  const expanded = city.territories.map(ids => new Set(ids));
  const quotas = [0, 0, 0, 0], transferred: number[][] = [[], [], [], []];
  if (!city.standingGangSlots.length) {
    const claimed = new Set(expanded.flatMap(ids => [...ids]));
    const civic = originalCivicBlocks(city, claimed).length;
    // Individual territory counts may overlap; only the unclaimed pool uses OR.
    const total = civic + expanded.reduce((sum, ids) => sum + ids.size, 0);
    let numerator = Math.ceil(civic / 2) * 256;
    for (let slot = 0; slot < 4; slot++)
      numerator += expanded[slot].size * (256 - originalEffectiveHostility(city.principals[0], slot as GangSlot));
    const first = total ? Math.trunc(100 * numerator / (total * 256)) : 0;
    return { percentages: [first, 100 - first, 0, 0, 0, 0], scores: null, civicBlocks: civic, civicPool: civic,
      unionQuotas: quotas, unionTransferred: transferred, support: [[], [], [], []] };
  }

  // 0x4BD7E0: single-business content 11..14 with a non-gang occupier.
  const available = city.blocks.filter(b => b.content >= 11 && b.content <= 14 && b.owner && !(b.owner.role >= 26 && b.owner.role <= 31))
    .map(b => b.index).sort((a, b) => a - b);
  const weights = city.teamstersWeights.map((weight, slot) => city.standingGangSlots.includes(slot as GangSlot) ? weight : 0);
  const totalWeight = weights.reduce<number>((sum, weight) => sum + weight, 0);
  let next = 0;
  if (totalWeight) for (let slot = 0; slot < 4; slot++) {
    quotas[slot] = Math.trunc(available.length * weights[slot] / totalWeight);
    // A transferred bit already in the recipient's territory still consumes quota.
    transferred[slot] = available.slice(next, next + quotas[slot]);
    next += quotas[slot];
    for (const id of transferred[slot]) expanded[slot].add(id);
  }
  const claimed = new Set(expanded.flatMap(ids => [...ids]));
  const civicBlocks = originalCivicBlocks(city, claimed).length;
  const civicPool = Math.max(500, civicBlocks);
  const averages = city.principals.map(p => Math.trunc(([0, 1, 2, 3] as const).reduce<number>((sum, slot) => sum + originalEffectiveHostility(p, slot), 0) / 4));
  const first = Math.trunc(civicPool * (averages[1] + 1) / (averages[0] + averages[1] + 2));
  const support: number[][] = [[], [], [], []];
  const scores = [first, civicPool - first, 0, 0, 0, 0];
  for (let i = 0; i < city.standingGangSlots.length; i++) {
    const slot = city.standingGangSlots[i];
    support[slot] = originalGangSupport(city, expanded[slot], slot);
    scores[i + 2] = support[slot].length;
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  const percentages = scores.map(score => Math.trunc(100 * score / total));
  percentages[0] += 100 - percentages.reduce((sum, score) => sum + score, 0);
  return { percentages, scores, civicBlocks, civicPool, unionQuotas: quotas, unionTransferred: transferred, support };
}
