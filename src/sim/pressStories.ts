import { addNews } from './events';
import type { Gang, WorldState } from './types';
import { gangManpower, gangWealth, money, territoryCount } from './world';
import { activeBlocks } from './cityLayout';
import { peopleList } from './entityLists';

/**
 * The original's gang stories (newspaper builders 0x59A510..0x59D4A0): a
 * warlord's death, a fortune made, a week's take, a private army, a city
 * under one mob's influence, bankruptcy, the death toll, and period colour.
 * Each milestone is printed once per gang (Gang.pressMilestones); headlines
 * are the original's own strings.
 */
export function pressStories(w: WorldState): void {
  const live = Object.values(w.gangs);
  const blocks = Math.max(1, activeBlocks(w).length);
  let printed = 0;
  for (const gang of live) {
    const done = (gang.pressMilestones ??= []);
    const boss = w.people[gang.bossId];
    const name = boss?.name ?? gang.name;
    const once = (key: string, headline: string, body: string, priority: 1 | 2 = 1) => {
      if (done.includes(key)) return false;
      done.push(key);
      addNews(w, { section: 'front', headline, body, gangId: gang.id, frontPagePriority: priority });
      printed++;
      return true;
    };
    if (gang.eliminated) {
      once('broke', 'BROKE!', `${gang.name.toUpperCase()} DECLARED BANKRUPT! What remains of the outfit has scattered.`);
      continue;
    }
    // A boss killed this week: the warlord story (0x59A510).
    if (boss && boss.status === 'dead' && boss.diedWeek === w.week)
      once(`dead-${boss.id}`, 'LOCAL WARLORD DEAD!', `${name.toUpperCase()} KILLED. The city waits to see who takes control of ${gang.name}.`, 2);

    const wealth = gangWealth(w, gang);
    // Smaller fortunes are passed over once a bigger one makes the news.
    const millions = Math.min(9, Math.floor(wealth / 1_000_000));
    if (millions >= 1) {
      if (!done.includes('good-life')) done.push('good-life');
      for (let m = 1; m < millions; m++) if (!done.includes(`million-${m}`)) done.push(`million-${m}`);
      once(`million-${millions}`, millions === 1 ? 'MAKING A MILLION!' : 'ANOTHER MILLION!',
        `The FBI claim that ${name} "has ${money(millions * 1_000_000)} stashed away"!`, 2);
    } else if (wealth >= 250_000) once('good-life', 'THE GOOD LIFE!', `FBI claim that "${name} has ${money(Math.round(wealth / 10_000) * 10_000)} stashed away"!`);

    const income = gang.lastWeekIncome ?? { legal: 0, illegal: 0, protection: 0, other: 0 };
    const take = income.legal + income.illegal + income.protection + income.other;
    // Each ladder prints its highest step reached; lower ones passed in the
    // same jump are marked done quietly (one paper ran the same story twice).
    const ladder = (prefix: string, steps: number[], value: number, print: (n: number) => void) => {
      const reached = steps.filter(n => value >= n);
      if (!reached.length) return;
      const top = reached[reached.length - 1];
      for (const n of reached) if (n !== top && !done.includes(`${prefix}-${n}`)) done.push(`${prefix}-${n}`);
      print(top);
    };
    ladder('take', [25, 100], take / 1000, n =>
      once(`take-${n}k`, 'CRIME DOES NOT PAY?', `FBI claim that ${name} "takes more than ${money(n * 1000)} each week".`));

    const men = gangManpower(w, gang);
    ladder('army', [25, 50, 100], men, n =>
      once(`army-${n}`, "MOBSTER'S PRIVATE ARMY!", `${name.toUpperCase()} EMPLOYS ${men} HOODS TO MAINTAIN CONTROL!`));

    const share = Math.round(territoryCount(w, gang.id) / blocks * 100);
    ladder('control', [10, 25, 50], share, n =>
      once(`control-${n}`, 'MOBSTER TAKES CONTROL!', `City Hall claims "${name} influences ${share}% of city".`, n >= 25 ? 2 : 1));
  }

  // The death toll in the gang wars (0x59D310), when the week was bloody.
  const dead = peopleList(w).filter(p => p.status === 'dead' && p.diedWeek === w.week && p.gangId != null);
  if (dead.length >= 3) {
    addNews(w, { section: 'deaths', headline: 'VICTIMS OF HATE!',
      body: `The latest death toll in the gang wars: ${dead.map(p => p.name).join(', ')}.`, gangId: null });
    printed++;
  }

  // A thin week gets one of the period's colour stories (0x59D4A0).
  if (!printed && w.week > 1) {
    const story = ERA_STORIES[((w.week * 7 + (w.rngState >>> 0)) % ERA_STORIES.length + ERA_STORIES.length) % ERA_STORIES.length];
    // Colour runs inside the paper, not as the lead.
    addNews(w, { section: 'city', headline: story[0], body: story[1], gangId: null });
  }
}

/** Period colour, after the original's table of era headlines. */
export const ERA_STORIES: [string, string][] = [
  ['GANG WARFARE COMES TO TOWN!', 'Citizens fear the troubles of the big cities have followed the railroad to Saint Volstead.'],
  ['THE WAVE ACROSS AMERICA!', 'Speakeasies open faster than the agents can close them, a federal report concedes.'],
  ['THE WOMEN OF AMERICA MARCH!', 'Dry-law campaigners parade past City Hall, demanding the law be enforced in earnest.'],
  ['DRY LAW, WET CITY', 'A survey of the wards finds liquor on sale within a stone\'s throw of every precinct house.'],
  ['JAZZ HALLS PACKED NIGHTLY', 'Bandleaders report record crowds; clergy warn of the moral peril of syncopation.'],
  ['STOCKS CLIMB AGAIN', 'Brokers on Exchange Street predict good times without end. "Buy now," says one.'],
  ['BATHTUB GIN BLINDS THREE', 'Physicians warn against bootleg spirits after a spate of poisonings in the poorer districts.'],
  ['MOTOR CARS CLOG DOWNTOWN', 'The traffic commissioner calls for signals at every major crossing.'],
  ['CITY COUNCIL DEBATES POLICE PAY', 'Aldermen admit that patrolmen\'s wages "invite temptation" on the beat.'],
  ['RUM-RUNNERS EVADE COAST GUARD', 'Fast launches are said to land cargo at the docks under cover of fog.'],
];

/** Gang-level press bookkeeping for older saves. */
export function pressMilestones(gang: Gang): string[] { return gang.pressMilestones ?? []; }
