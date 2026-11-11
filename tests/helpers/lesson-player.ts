import { captureTutorialProgress, tutorialById } from '../../src/app/tutorials';
import { bribeOfficial, bribePrice, buyWeapon, employPoliceOfficer, hireRecruit, issueOrder, nearTerritory, setDiplomacy, toggleEvadeTax } from '../../src/sim/api';
import type { ApiResult, IssueOrderInput } from '../../src/sim/api';
import { buildingValue, isValidAreaTarget } from '../../src/sim/execution';
import { crewPeople, readyForPlanning } from '../../src/sim/orderStaffing';
import type { Sim } from '../../src/sim/sim';
import { allBuildings, dist, ownedBuildings, protectedBuildings, typeOf } from '../../src/sim/world';

export interface LessonHooks {
  sim(): Sim;
  changed(): Promise<void>;
  week(): Promise<void>;
  visit(view: 'lieutenantsViewed' | 'reportsViewed'): Promise<void>;
  checkpoint(): Promise<void>;
  log?(text: string): void;
}

/** A player using public game actions and the shipped lesson seeds. No world,
 * ownership, money, recruit or completion fields are injected to pass a step. */
export async function playLesson(hooks: LessonHooks) {
  const tutorial = tutorialById(hooks.sim().world.options.tutorialId)!;
  const events: string[] = [];
  let checkpointed = false;
  const note = (text: string) => { events.push(text); hooks.log?.(text); };
  async function observe() {
    const progress = captureTutorialProgress(hooks.sim().world);
    await hooks.changed();
    if (!checkpointed && progress.length >= 2 && progress.length < tutorial.steps.length) {
      await hooks.checkpoint();
      checkpointed = true;
      note(`Week ${hooks.sim().world.week}: saved and restored ${progress.length}/5 steps`);
    }
  }
  async function action(label: string, perform: () => ApiResult) {
    const result = perform();
    if (result.ok) { note(`Week ${hooks.sim().world.week}: ${label}`); await observe(); }
    else note(`Week ${hooks.sim().world.week}: ${label} refused: ${result.error}`);
    return result.ok;
  }
  if (tutorial.id === 1) { await hooks.visit('lieutenantsViewed'); await observe(); }
  for (let round = 0; round < 20; round++) {
    let sim = hooks.sim(), w = sim.world, gang = sim.playerGang;
    if (w.phase === 'gameOver') throw new Error(`${tutorial.name}: ${w.outcome?.reason}; ${events.slice(-6).join('; ')}`);
    if (tutorial.id === 1 && w.week > 1) { await hooks.visit('reportsViewed'); await observe(); }
    if (captureTutorialProgress(w).length === 5) break;
    const boss = w.people[gang.bossId];
    const nearby = [...allBuildings(w)].sort((a, b) => dist(w.lots[a.lotId].center, boss.pos) - dist(w.lots[b.lotId].center, boss.pos));
    async function order(label: string, input: Omit<IssueOrderInput, 'teamId'>) {
      // A checkpoint may replace the Sim, so look up its crew afresh.
      const current = hooks.sim(), g = current.playerGang;
      const refusals: string[] = [];
      for (const team of g.teamIds.map(id => current.world.teams[id]).sort((a,b) => a.timeUsed - b.timeUsed)) {
        const available = crewPeople(current.world, team).filter(p => readyForPlanning(current.world, p));
        if (!available.length) { refusals.push(`${team.name}: nobody available`); continue; }
        // Use the same people a player can select in the job card. Requesting
        // a jailed crew member prevented every job until their release.
        const recruiter = input.type === 'recruit'
          ? available.sort((a,b) => b.skills.intelligence - a.skills.intelligence)[0] : null;
        const result = issueOrder(current.world, g.id, { ...input, teamId: team.id, opts: {
          manpower: recruiter ? 1 : Math.min(3, available.length),
          ...(recruiter ? { preferredHoodId: recruiter.id } : {}), ...input.opts,
        } });
        if (result.ok) { note(`Week ${current.world.week}: ${label}`); await observe(); return true; }
        refusals.push(`${team.name}: ${result.error}`);
      }
      note(`Week ${current.world.week}: ${label} refused: ${refusals.join('; ') || 'no crew'}`);
      return false;
    }
    if (tutorial.id === 1 && !captureTutorialProgress(w).includes(1)) {
      const site = nearby.find(b => isValidAreaTarget(w, gang.id, 'extort', b))!;
      await order('Extort a nearby block', { type: 'extort', blockIds: [site.blockId] });
    }
    if (tutorial.id === 2) {
      // Buy the cheapest front/centre pair within the permitted reach.
      const sites = nearby.filter(b => ['commercial', 'industrial', 'tenement'].includes(b.cls) && b.state === 'trading' && !typeOf(b)?.special);
      const centre = (blockId: number) => allBuildings(w).find(b => b.blockId === blockId && w.lots[b.lotId].index === 4);
      const fronts = sites.filter(b => b.ownerGangId === gang.id && centre(b.blockId) && centre(b.blockId)!.typeId !== 'office');
      let front = fronts[0];
      if (!front) {
        const target = sites.filter(b => b.ownerGangId == null && nearTerritory(w, gang.id, b.blockId, 2) &&
          centre(b.blockId)?.cls === 'empty')
          .sort((a,b) => buildingValue(w,a) - buildingValue(w,b))[0];
        if (target && gang.cash >= buildingValue(w, target) + 1200) await order('Buy a second legal site', { type: 'buyPremises', buildingIds: [target.id] });
      } else {
        const land = centre(front.blockId)!;
        if (land.ownerGangId == null && gang.cash >= buildingValue(w, land) + 1200) {
          await order('Buy the centre lot behind the front', { type: 'buyPremises', buildingIds: [land.id] });
        } else if (land.ownerGangId === gang.id && land.cls === 'empty' && gang.cash >= 6200) {
          await order('Open a numbers racket behind the front', { type: 'setUpBusiness', buildingIds: [land.id], opts: { businessTypeId: 'numbersRacket', frontBuildingId: front.id } });
        }
      }
    }
    if (tutorial.id === 3) {
      for (const role of ['lawyer', 'accountant'] as const) {
        sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
        const slot = role === 'lawyer' ? 'lawyerId' : 'accountantId';
        if (gang[slot] != null) continue;
        const ready = gang.recruitIds.map(id => w.people[id]).find(p => p.role === role && p.gangId == null && p.status === 'active');
        if (ready) await action(`Hire the recruited ${role}`, () => hireRecruit(w, gang.id, ready.id, 'pool'));
        else {
          const candidate = Object.values(w.people).filter(p => p.role === role && p.gangId == null && p.status === 'active' && p.buildingId != null)
            .sort((a,b) => dist(a.pos, boss.pos) - dist(b.pos, boss.pos))[0];
          if (candidate) await order(`Recruit at the ${role}'s workplace`, { type: 'recruit', buildingIds: [candidate.buildingId!], opts: { recruitAs: role } });
        }
      }
      sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
      if (gang.lawyerId != null) {
        const officer = w.policeIds.map(id => w.people[id]).filter(p => p.status === 'active').sort((a,b) => bribePrice(w,a,gang.id) - bribePrice(w,b,gang.id))[0];
        if (!captureTutorialProgress(w).includes(1)) await action('Bribe a police official', () => bribeOfficial(w, gang.id, officer.id));
        sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
        // Another gang may already pay the cheapest officer; hire a free one.
        const free = w.policeIds.map(id => w.people[id]).filter(p => p.status === 'active' && p.employedBy == null)
          .sort((a, b) => bribePrice(w, a, gang.id) - bribePrice(w, b, gang.id))[0];
        if (!gang.employedPoliceIds.length && free) await action('Put an officer on the payroll', () => employPoliceOfficer(w, gang.id, free.id));
      }
      sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
      if (gang.accountantId != null && !gang.evadingTax) await action('Enable tax evasion', () => toggleEvadeTax(w, gang.id));
    }
    if (tutorial.id === 4) {
      if (!captureTutorialProgress(w).includes(0)) await action('Buy a pistol for the crew', () => buyWeapon(w, gang.id, 'pistol', gang.teamIds[0]));
      sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
      const rival = Object.values(w.gangs).find(g => !g.isPlayer && !g.eliminated)!;
      const site = ownedBuildings(w, rival.id).find(b => b.cls !== 'empty' && b.state !== 'destroyed')!;
      if (!captureTutorialProgress(w).includes(1)) await order('Explore a rival site', { type: 'explore', buildingIds: [site.id] });
      sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
      if (!captureTutorialProgress(w).includes(2)) await action('Offer aggression to the rival', () => setDiplomacy(w, gang.id, rival.id, 'aggression'));
      if (!captureTutorialProgress(w).includes(3)) await order('Ambush the rival block', { type: 'ambush', blockIds: [site.blockId], opts: { manpower: 1 } });
    }
    sim = hooks.sim(); w = sim.world; gang = sim.playerGang;
    if ([2, 3].includes(tutorial.id)) {
      const protectedSites = protectedBuildings(w, gang.id).filter(b => b.state === 'trading');
      if (protectedSites.length) await order('Collect weekly protection', { type: 'collectProtection', buildingIds: protectedSites.map(b => b.id) });
      const targets = nearby.filter(b => isValidAreaTarget(w, gang.id, 'extort', b)).slice(0, 8);
      if (targets.length) await order('Expand protection income', { type: 'extort', buildingIds: targets.map(b => b.id) });
    }
    await observe();
    if (captureTutorialProgress(hooks.sim().world).length === 5) break;
    await hooks.week();
    await observe();
    const settled = hooks.sim();
    note(`Week ${settled.world.week}: cash ${settled.playerGang.cash}, completed ${captureTutorialProgress(settled.world).join(',')}; ` + settled.world.lastWeekOrders.filter(o => o.gangId === settled.playerGang.id).map(o => `${o.type}: ${o.state} ${o.failReason ?? ''}`).join(' | '));
  }
  const sim = hooks.sim(), completed = captureTutorialProgress(sim.world);
  if (completed.length !== 5 || !checkpointed) throw new Error(`${tutorial.name} incomplete at week ${sim.world.week}: ${completed.join(',')}; ${events.join('; ')}`);
  note(`${tutorial.name}: complete at week ${sim.world.week}, with a mid-lesson save/load`);
  return { lesson: tutorial.id, week: sim.world.week, completed, checkpointed, events };
}
