import { originalElectionPoll } from '../originalElection';
import { ELECTION_BLOCKS_REQUIRED, ELECTION_WEEKS, MAYOR_ELECTION_CYCLE, MAYOR_INITIAL_TERM_WEEKS } from '../constants';
import { restoreElectionTiming } from '../electionTiming';
import { ensureCourtOfficials } from '../courtOfficials';
import { availableSpecialist } from '../specialists';
import { BUILDING_BY_ID } from '../data/buildings';
import { addMessage, addNews } from '../events';
import { currentFinances, payCash } from '../finances';
import type { Rng } from '../rng';
import type { Gang, ID, WorldState } from '../types';
import { allBuildings, buildingDoor, dist, money, territoryBlocks, territoryCount } from '../world';

/** The original weekly pass advances the election before the mayor record.
 * A new mayor starts at four; an incumbent retains their counter after a poll.
 * The mayor's 22-count trigger is independent of lastResultWeek. */
export function weeklyPolitics(w: WorldState, rng: Rng): void {
  restoreElectionTiming(w);
  weeklyElectionRace(w, rng);
  const mayor = w.people[w.mayorId];
  if (!mayor || mayor.status === 'dead') return;
  let term = w.election.mayorTerm;
  if (!term || term.personId !== mayor.id) {
    term = w.election.mayorTerm = { personId: mayor.id, weeks: MAYOR_INITIAL_TERM_WEEKS };
  }
  if (++term.weeks >= MAYOR_ELECTION_CYCLE) {
    term.weeks = 0;
    callElection(w, rng, false);
  }
}

function weeklyElectionRace(w: WorldState, rng: Rng): void {
  const mayor = w.people[w.mayorId];
  const mayorDead = !mayor || mayor.status === 'dead';

  if (!w.election.active) {
    if (mayorDead) callElection(w, rng, true);
    return;
  }

  withdrawUnavailableCandidates(w);
  // 0x4BD310 opens every weekly pass with the nominee refresh (0x4BD090): an
  // empty principal slot takes the next judge before the poll.
  if (w.election.candidates.length) refreshNominees(w);
  if (!w.election.candidates.length) {
    callElection(w, rng, mayorDead);
    return;
  }
  if (w.election.beganInWeek) {
    delete w.election.beganInWeek;
    tallyVotes(w, rng);
    return;
  }

  w.election.weeksLeft--;
  tallyVotes(w, rng);

  if (w.election.weeksLeft <= 0) concludeElection(w);
}

/** Recheck before the campaign bill and again after courts, before the poll.
 * Original city: the lawyer is needed only to enter (order 0x28). The race
 * never reads the gang's lawyer afterwards (ElectionRace_* 0x4BBC70–0x4BD310),
 * and the only withdrawal is an unpaid campaign bill (0x6CFB30 lines
 * 1239–1252 → RemoveParticipant 0x4BC0A0), handled in settleElectionCampaign.
 * Compact cities keep the remake policy: replace the lawyer before
 * settlement or the campaign ends. Money already spent is not refunded. */
export function withdrawUnavailableCandidates(w: WorldState): void {
  if (!w.election.active) return;
  w.election.candidates = w.election.candidates.filter(c => {
    const p = w.people[c.id], gang = c.gangId == null ? null : w.gangs[c.gangId];
    const hasLawyer = !!gang && (!!w.cityLayout?.original || !!availableSpecialist(w, gang, 'lawyer'));
    const eligible = !!p && (p.status === 'active' || p.status === 'onTrial') &&
      (c.kind !== 'gang' || (!!gang && !gang.eliminated && gang.bossId === c.id && hasLawyer));
    if (!eligible && gang) {
      gang.runningForOffice = false;
      const message = !hasLawyer
        ? `${gang.name}'s campaign has ended: an available lawyer is required to remain in the election.`
        : `${gang.name}'s campaign has ended: its candidate is no longer eligible.`;
      w.weekLog.push(message);
      if (gang.isPlayer) addMessage(w, 'failed', message);
    }
    return eligible;
  });
}

/**
 * 0x4C3280, the mayor's death: the seat is cleared at once. With no election
 * under way one begins immediately (0x4BCD00); otherwise the ballot is
 * refreshed (0x4BD090) and re-polled (0x4BC130). The begin routine takes its
 * principals in list order, not at random, so no RNG is drawn here.
 */
export function onMayorDeath(w: WorldState): void {
  if (!w.election.active) {
    w.election.active = true;
    w.election.weeksLeft = ELECTION_WEEKS;
    w.election.candidates = [];
    w.election.beganInWeek = true;
    refreshNominees(w);
    addNews(w, {
      section: 'politics', headline: 'CITY TO ELECT NEW MAYOR', frontPagePriority: 2,
      body: `Polling will be held in ${ELECTION_WEEKS} weeks. Candidates have begun campaigning across the city.`,
      gangId: null,
    });
    w.weekLog.push('The mayor is dead: an election has been called.');
    return;
  }
  refreshNominees(w);
}

/**
 * 0x4BD090: drop dead or jailed candidates, then fill each empty principal
 * slot with the first judge not yet standing (the original walks its official
 * list for the first person whose nominated flag +0x80 is clear). A mayor
 * who is alive keeps the first slot. Re-polls the original city at once.
 */
export function refreshNominees(w: WorldState): void {
  const standing = (id: ID) => ['active', 'onTrial'].includes(w.people[id]?.status ?? 'dead');
  w.election.candidates = w.election.candidates.filter(c => c.kind === 'gang' || standing(c.id));
  let civic = w.election.candidates.filter(c => c.kind !== 'gang').length;
  for (const id of w.judgeIds) {
    if (civic >= 2) break;
    if (!standing(id) || w.election.candidates.some(c => c.id === id)) continue;
    // Principals come first on the ballot, ahead of the gang candidates.
    w.election.candidates.splice(civic, 0, { id, kind: 'judge', gangId: null, votes: 0 });
    civic++;
  }
  const poll = originalElectionPoll(w);
  if (poll) for (const c of w.election.candidates) c.votes = poll.votes.get(c.id) ?? 0;
}

function callElection(w: WorldState, rng: Rng, mayorDead: boolean): void {
  ensureCourtOfficials(w, rng);
  const candidates: WorldState['election']['candidates'] = [];
  const mayor = w.people[w.mayorId];
  if (!mayorDead && mayor && ['active', 'onTrial'].includes(mayor.status)) candidates.push({ id: mayor.id, kind: 'mayor', gangId: null, votes: 0 });

  // A judge always stands against the mayor; two if the seat is vacant.
  const judges = rng.shuffle([...w.judgeIds]);
  const judgeCount = mayorDead ? 2 : 1;
  for (let i = 0; i < judgeCount && i < judges.length; i++) {
    candidates.push({ id: judges[i], kind: 'judge', gangId: null, votes: 0 });
  }

  w.election.active = true;
  w.election.weeksLeft = ELECTION_WEEKS;
  w.election.candidates = candidates;

  addNews(w, {
    section: 'politics',
    headline: mayorDead ? 'CITY TO ELECT NEW MAYOR' : 'MAYORAL ELECTION CALLED',
    frontPagePriority: 2,
    body: `Polling will be held in ${ELECTION_WEEKS} weeks. Candidates have begun campaigning across the city.`,
    gangId: null,
  });
  w.weekLog.push('A mayoral election has been called.');
}

/**
 * The power base needed to stand. The manual's figure is a hundred blocks,
 * which only makes sense in a city big enough to hold that many; in a smaller
 * one the requirement scales down to the same share of the map.
 */
export function electionBlocksRequired(w: WorldState): number {
  return Math.max(12, Math.min(ELECTION_BLOCKS_REQUIRED, Math.round(w.blocks.length * 0.28)));
}

/** 0x6DD210 sums controlled blocks' land values; 0x6CFB30 divides by four.
 * Use each current territory block once, including protected premises. The
 * original city bills its original 0..255 land values; compact cities have
 * only the remake's 0..100 scale. */
export function campaignWeeklyCost(w: WorldState, gangId: ID): number {
  return Math.trunc(territoryBlocks(w, gangId)
    .reduce((sum, block) => sum + (block.original?.landValue ?? block.landValue), 0) / 4);
}

export function officeEntryCheck(w: WorldState, gangId: ID): { can: boolean; reason: string } {
  const gang = w.gangs[gangId];
  const refuse = (reason: string) => ({ can: false, reason });
  if (!gang || gang.eliminated) return refuse('This gang cannot stand for office.');
  // A short game is a race for power, wealth or territory; the mayoralty is
  // a way to win (or lose) only the full game.
  if (w.options.mode !== 'normal') return refuse('Only the full game has a mayoralty to win.');
  const lawyer = availableSpecialist(w, gang, 'lawyer'), boss = w.people[gang.bossId];
  if (!lawyer) return refuse('You need an available lawyer to stand for office.');
  if (!boss || !['active', 'onTrial'].includes(boss.status)) return refuse('Your boss is unavailable to stand for office.');
  if (!w.election.active) return refuse('No election is under way.');
  if (w.election.candidates.some(c => c.gangId === gangId)) return { can: true, reason: 'Your candidate is already on the ballot.' };
  // Player lawyer gate 0x760880 permits phase <=4; AI 0x6AFA90 <=3.
  // The initial phase is repeated once: phases 4/3 mean 2/3 weeks left.
  if (w.election.weeksLeft < (gang.isPlayer ? 2 : 3)) return refuse('Nominations have closed.');
  if (territoryCount(w, gangId) < electionBlocksRequired(w))
    return refuse(`You need ${electionBlocksRequired(w)} blocks to stand for office.`);
  const cost = campaignWeeklyCost(w, gangId);
  // The player's acceptance gate allows exact funds; the AI requires a surplus.
  if (gang.cash < cost || (!gang.isPlayer && gang.cash === cost))
    return refuse(`You need ${money(cost)}${gang.isPlayer ? '' : ' plus a cash reserve'} for the weekly campaign cost.`);
  if (w.election.candidates.length >= 6) return refuse('The ballot is full.');
  return { can: true, reason: `Current weekly campaign cost: ${money(cost)}.` };
}

export function canRunForOffice(w: WorldState, gangId: ID): boolean {
  return officeEntryCheck(w, gangId).can;
}

export function enterElection(w: WorldState, gangId: ID): boolean {
  if (!canRunForOffice(w, gangId)) return false;
  const gang = w.gangs[gangId];
  if (w.election.candidates.some((c) => c.gangId === gangId)) {
    gang.runningForOffice = true;
    return true;
  }
  if (w.election.candidates.length >= 6) return false;
  w.election.candidates.push({ id: gang.bossId, kind: 'gang', gangId, votes: 0 });
  gang.runningForOffice = true;
  // The original's entry (0x4BC040) posts nothing; a computer gang there may
  // enter and withdraw again every week (0x6AFA90).
  if (!w.cityLayout?.original) addNews(w, {
    section: 'politics',
    headline: 'BUSINESSMAN ENTERS MAYORAL RACE',
    body: `${w.people[gang.bossId]?.name ?? 'A local figure'} has announced a candidacy for mayor, promising order and prosperity.`,
    gangId,
  });
  return true;
}

export function withdrawFromElection(w: WorldState, gangId: ID): void {
  w.election.candidates = w.election.candidates.filter((c) => c.gangId !== gangId);
  const gang = w.gangs[gangId];
  if (gang) gang.runningForOffice = false;
}

/** Original finance order: wages first, then the full campaign bill or withdrawal.
 * Campaigns never receive partial payment or lower the crew's wage fraction. */
export function settleElectionCampaign(w: WorldState, gang: Gang): void {
  if (!gang.runningForOffice) return;
  if (!w.election.active || !w.election.candidates.some(c => c.gangId === gang.id)) {
    withdrawFromElection(w, gang.id);
    return;
  }
  const cost = campaignWeeklyCost(w, gang.id);
  if (gang.cash < cost) {
    withdrawFromElection(w, gang.id);
    const message = `${gang.name} withdrew from the election: the ${money(cost)} weekly campaign cost could not be paid.`;
    w.weekLog.push(message);
    if (gang.isPlayer) addMessage(w, 'failed', message);
    return;
  }
  payCash(w, gang, 'upkeep', cost);
  const report = currentFinances(w, gang);
  report.campaignCost = (report.campaignCost ?? 0) + cost;
}

function tallyVotes(w: WorldState, rng: Rng): void {
  // The original city uses the recovered original tally (no RNG, no flat
  // Teamsters bonus); compact cities keep the remake formula below.
  const poll = originalElectionPoll(w);
  if (poll) {
    for (const c of w.election.candidates) c.votes = poll.votes.get(c.id) ?? 0;
    return;
  }
  // The union block vote goes to whoever runs the Teamsters — unless rival
  // hoods are standing over the industrial sites.
  let unionGang: ID | null = null;
  for (const b of allBuildings(w)) {
    if (b.typeId !== 'teamsters' || b.state !== 'trading' || b.ownerGangId == null ||
      !w.gangs[b.ownerGangId] || w.gangs[b.ownerGangId].eliminated) continue;
    const front = b.frontId != null ? w.buildings[b.frontId] : null;
    if (front && BUILDING_BY_ID[front.typeId]?.special === 'union') {
      unionGang = b.ownerGangId;
      break;
    }
    if (unionGang == null) unionGang = b.ownerGangId;
  }
  let unionBlocked = false;
  if (unionGang != null) {
    const industrialGuarded = allBuildings(w).some(
      (b) =>
        b.cls === 'industrial' && b.state === 'trading' &&
        b.ownerGangId != null &&
        b.ownerGangId !== unionGang &&
        !!w.gangs[b.ownerGangId] && !w.gangs[b.ownerGangId].eliminated &&
        b.guardIds.some(id => {
          const hood = w.people[id];
          // Guard lists may retain departed actors or the -1 police marker.
          // Only a rival's hood actually at the post can pressure its workers.
          return hood?.status === 'active' && !hood.inVehicle &&
            ['hood', 'lieutenant'].includes(hood.role) && hood.gangId === b.ownerGangId &&
            dist(hood.pos, buildingDoor(w, b)) <= 5;
        }),
    );
    unionBlocked = industrialGuarded;
  }

  for (const c of w.election.candidates) {
    let votes = 0;
    if (c.kind === 'gang' && c.gangId != null) {
      const gang = w.gangs[c.gangId];
      if (!gang || gang.eliminated) {
        c.votes = 0;
        continue;
      }
      votes =
        gang.popularity * 1.6 +
        territoryCount(w, gang.id) * 0.6;
      if (unionGang === gang.id && !unionBlocked) votes *= 1.1;
      // The campaign bill is already paid as upkeep in the weekly settlement.
    } else {
      const p = w.people[c.id];
      const respectability = p ? p.skills.intelligence * 12 : 30;
      votes = 45 + respectability + rng.range(-8, 8);
      // A candidate the mob has been leaning on loses ground.
      for (const gang of Object.values(w.gangs)) {
        if (p && (p.opinion[gang.id] ?? 0) > 40) votes -= 6;
      }
    }
    c.votes = Math.max(0, Math.round(votes + rng.range(-5, 5)));
  }
}

function concludeElection(w: WorldState): void {
  w.election.active = false;
  w.election.lastResultWeek = w.week;
  const sorted = [...w.election.candidates].sort((a, b) => b.votes - a.votes);
  const winner = sorted[0];
  if (winner) w.election.lastResult = { week: w.week, winnerId: winner.id, candidates: w.election.candidates.map(c => ({ ...c })) };
  for (const g of Object.values(w.gangs)) g.runningForOffice = false;

  if (!winner) return;

  if (winner.kind === 'gang' && winner.gangId != null) {
    const gang = w.gangs[winner.gangId];
    addNews(w, {
      section: 'politics',
      headline: 'NEW MAYOR ELECTED',
      frontPagePriority: 3,
      body: `${w.people[winner.id]?.name ?? 'The winner'} has been elected Mayor of Saint Volstead in a decisive result.`,
      gangId: winner.gangId,
    });
    w.weekLog.push(`${gang?.name ?? 'A gang leader'} won the mayoral election.`);
    // Resolved by the win/lose check in the simulation.
    w.electionWinnerGangId = winner.gangId;
  } else {
    // A civic candidate takes the seat. The outgoing mayor goes back to being a
    // private citizen, and a judge who wins gives up the bench.
    const outgoing = w.people[w.mayorId];
    if (outgoing && outgoing.id !== winner.id && outgoing.role === 'mayor') {
      outgoing.role = 'citizen';
    }
    w.judgeIds = w.judgeIds.filter((id) => id !== winner.id);
    w.mayorId = winner.id;
    const p = w.people[winner.id];
    if (p) p.role = 'mayor';
    addNews(w, {
      section: 'politics',
      headline: 'MAYOR TAKES OFFICE',
      frontPagePriority: 3,
      body: `${p?.name ?? 'The winner'} was sworn in as Mayor following this week's poll.`,
      gangId: null,
    });
    w.weekLog.push(`${p?.name ?? 'A new mayor'} was elected Mayor.`);
  }
  w.election.candidates = [];
}
