/**
 * Hover tips and right-click cards for the desk's buttons: the section tabs,
 * the lieutenant strip and the left page, the map bar, the street HUD and the
 * tools in the corner. The card only explains. It never presses the button.
 */

export interface ControlHelpEntry {
  /** What the button does, in a sentence or two. */
  body: string;
  /** The key that does the same, when there is one. */
  keys?: string;
}

const HELP: Record<string, ControlHelpEntry> = {
  // Section tabs along the top of the journal.
  lieutenants: { body: 'Your crews: who runs them, who is in them, and the orders for this week.', keys: 'F1' },
  accountant: { body: 'The books: income, wages, the bank, and the accountant who keeps the tax man away.', keys: 'F2' },
  lawyer: { body: 'Your lawyer: arrests, trials, and the blocks he keeps the police away from.', keys: 'F3' },
  diplomacy: { body: 'The other gangs: what they think of you, alliances, and threats.', keys: 'F4' },
  newspaper: { body: 'This week’s St. Volstead papers: what the city read about you and your rivals.', keys: 'F5' },
  graphs: { body: 'How cash, men, territory and heat moved week by week.', keys: 'F6' },
  'city maps': { body: 'The city plan with what you know about each block and building.', keys: 'F7' },
  'game options': { body: 'Sound, speed, figures and other settings for this city.', keys: 'F8' },

  // The left page.
  'gang details': { body: 'Open the gang’s totals: cash, men, territory, weapons and vehicles.' },
  'choose on map': { body: 'Pick this crew’s target straight from the city plan.' },
  'see the city': { body: 'Fold the plan away and look at the city itself.' },
  sack: { body: 'Let this lieutenant go for good.' },
  kill: { body: 'Have this lieutenant killed. There is no undoing it.' },
  demote: { body: 'Send the lieutenant back to the ranks. His crew breaks up into the pool.' },
  skills: { body: 'The lieutenant’s skills, and those of each man in his crew.' },
  pay: { body: 'Set this lieutenant’s weekly pay against what he wants.' },
  territory: { body: 'The blocks this crew looks after. Pick them on the plan.' },
  'business orders': { body: 'Collect protection, buy premises, set up and run businesses.' },
  // The lieutenant panel's badges and lines (data-help names them).
  'personnel orders': { body: 'Recruit, patrol, guard, explore and other jobs for the men.' },
  'minor crimes': { body: 'Extort, intimidate, raid and kidnap.' },
  'violent crimes': { body: 'Assault, smash up, arson and bombing. Loud, and the police notice.' },
  clipboard: { body: 'People and places you have noted, ready to use as order targets.' },
  hoods: { body: 'The pool of free hoods. Drag one onto a crew to add him.' },
  weapons: { body: 'The gang’s weapons. Drag one onto a crew to arm it.' },
  vehicles: { body: 'The gang’s cars and trucks. Drag one onto a crew.' },
  recruitment: { body: 'People your crews found this week, waiting for an answer.' },
  orders: { body: 'This crew’s orders for the week.' },
  reports: { body: 'What this crew did last week.' },
  'hit the streets': { body: 'Save your orders and start the working week. End Week, beside Pause, finishes it without the street animation.' },
  'open the journal': { body: 'Bring the journal back over the city.' },
  'fold the journal': { body: 'Fold the journal away to see the whole city.' },
  'empty crew': { body: 'An empty crew. Open the pool to promote a hood, or drop one here.' },
  team: { body: 'Swap the paper back from the lieutenant’s skills to the men in his crew.' },
  'crew name': { body: 'The crew’s name. Click to rename it.' },
  loyalty: { body: 'How loyal the lieutenant is, 0 to 100. Under 30 he may skim, talk to the police or walk out; fair pay and success keep it up.' },
  wanted: { body: 'How hard the FBI is after this man, 0 to 100. It rises with the crimes he is seen at; a high figure puts him on the Most Wanted list and risks an arrest.' },
  absent: { body: 'The lieutenant is not at work this week: his crew cannot carry out orders until he is back.' },
  'crew size': { body: 'The lieutenant and the hoods under him. Drag hoods here from the pool to add them.' },
  'crew weapons': { body: 'Weapons this crew carries. Drag one from the cache onto the crew to add it.' },
  'crew vehicles': { body: 'Cars and trucks this crew can use. They save walking time on long runs.' },
  'week assigned': { body: 'How much of this crew’s working week the orders already take. Orders past 100% will not get done.' },
  'pay line': { body: 'What the lieutenant is paid a week against what he wants. Paid less than he wants, his loyalty falls.' },
  'crew roster': { body: 'Open or close the list of the crew’s men (or the lieutenant’s skills). Click a man for his card.' },
  'crew member': { body: 'One of the crew. Click for his card; drag him to another crew or the pool.' },
  'skill stars': { body: 'Skills in half stars, up to five: business, intimidation, firearms, stealth and the rest. They decide how well he does each job.' },
  'order queue': { body: 'The orders this crew has for the week. Edit one to change it, × to cancel.' },
  edit: { body: 'Open the job card for this order again.' },
  'repeat order': { body: 'Give the same order again this week.' },
  interrogate: { body: 'Question the prisoner for names. Each time he is less willing to talk.' },
  assault: { body: 'Beat the prisoner. He talks more readily, and may not survive.' },
  release: { body: 'Let the prisoner go home.' },
  'gang boss': { body: 'The boss. Lose him and the game is over.' },
  'gang assets': { body: 'Premises, weapons and vehicles at their value, cash not counted. Going straight needs $250,000 of it.' },
  'gang blocks': { body: 'Blocks the gang controls. Standing for mayor needs enough of them.' },
  'gang men': { body: 'Lieutenants, hoods and specialists on the payroll, and the weekly wage bill.' },
  'last week': { body: 'What this crew did last week, order by order.' },

  // The map bar under the plan and the street HUD.
  'city plan': { body: 'The street plan with building types and the holdings you know of.', keys: 'Insert' },
  city: { body: 'The city itself, in three dimensions.' },
  plan: { body: 'Zoom out to the city plan.', keys: 'Insert' },
  rooftop: { body: 'Look down over the rooftops.', keys: 'Home' },
  street: { body: 'Down to street level.', keys: 'Page Up' },
  flip: { body: 'Turn the camera round to look the other way.', keys: 'F' },
  'reverse view': { body: 'Turn the camera round to look the other way.', keys: 'F' },
  hq: { body: 'Centre the view on your headquarters.' },
  'center on headquarters': { body: 'Centre the view on your headquarters.' },
  "lt's area": { body: 'Shade the blocks given to the selected lieutenant.' },
  'lieutenant’s area': { body: 'Shade the blocks given to the selected lieutenant.' },
  'land value': { body: 'Shade the blocks by what the land is worth.' },
  security: { body: 'Shade the blocks by how well they are guarded.' },
  hostility: { body: 'Shade the blocks by how much the people there dislike you.' },
  'crime hot spots': { body: 'Shade the blocks where the police are watching most.' },
  'recent events': { body: 'Mark where things happened this week.' },
  clear: { body: 'Take every shading off the map.' },
  'clear overlays': { body: 'Take every shading off the map.' },
  'clear map overlays': { body: 'Take every shading off the map.' },
  pause: { body: 'Stop the clock. Orders wait where they are.', keys: 'P' },
  resume: { body: 'Start the clock again.', keys: 'P' },
  'end week': { body: 'Finish the rest of the week without the street animation. Fights still resolve.', keys: 'Escape returns to normal speed' },
  help: { body: 'How to play: the desk, the orders, and the keys.', keys: '?' },
  'city plan view': { body: 'Zoom out to the city plan.', keys: 'Insert' },
  'rooftop view': { body: 'Look down over the rooftops.', keys: 'Home' },
  'street view': { body: 'Down to street level.', keys: 'Page Up' },
  'tagged characters': { body: 'Everyone of yours on the streets, by crew. Click one to watch him.' },
  'clear tagged windows': { body: 'Close every tagged person’s window.' },
  'remove buildings': { body: 'Hide the buildings so you can see the people in the streets.', keys: 'B' },
  'restore buildings': { body: 'Bring the buildings back.', keys: 'B' },
  'automatic cutaway': { body: 'Lower the roofs near the camera so you can see inside.' },
  'message override': { body: 'Keep accelerated time when reports arrive.' },
  exit: { body: 'Save and go back to the main menu.', keys: 'Ctrl+Q' },

  // The corner tools.
  'mute music': { body: 'Silence the music. Sound effects stay on.' },
  'unmute music': { body: 'Bring the music back.' },
  'debug report': { body: 'Write a report of this city’s state to the 09 Reports folder.' },
  'auto test': { body: 'A simulated player runs the desk for some weeks and writes a report.' },
  stop: { body: 'Stop the Auto Test after the current week.' },
};

function normal(text: string): string {
  return text.toLowerCase().replace(/[!…]/g, '').replace(/\s+/g, ' ').trim();
}

/** The button's name: its accessible label, else its first line of text, else its tooltip. */
export function controlLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const text = (el as HTMLElement).innerText?.split('\n').map((line) => line.trim()).find((line) => line && !/^\d+$/.test(line));
  if (text) return text;
  return (el.getAttribute('data-tip') ?? el.getAttribute('title') ?? '').trim();
}

/** A badge or line names its help entry in data-help; a button is matched by its label. */
export function controlHelpFor(el: Element, label: string): ControlHelpEntry | undefined {
  const named = el.getAttribute('data-help');
  return (named ? HELP[normal(named)] : undefined) ?? controlHelp(label);
}

export function controlHelp(label: string): ControlHelpEntry | undefined {
  const key = normal(label);
  if (HELP[key]) return HELP[key];
  // Category message boxes and similar: match the start of the label.
  const found = Object.keys(HELP).filter((name) => key.startsWith(name)).sort((a, b) => b.length - a.length)[0];
  return found ? HELP[found] : undefined;
}

/** A key named in brackets at the end of a tooltip, like "Pause (P)". */
export function keyFromTip(tip: string): string | undefined {
  const match = /\(([^()]{1,24})\)\s*$/.exec(tip) ?? /\(([^()]{1,24})\);/.exec(tip);
  return match?.[1];
}

/** Buttons that get a tip and a card. Dialogs and the city canvas keep their own. */
export const CONTROL_SCOPE = '.game-shell, .always-chrome';
export const CONTROL_SELECTOR = 'button, [role="tab"], [data-help]';
export const CONTROL_EXCLUDE = '.modal-back, .modal, [role="dialog"], .inspect-card, canvas';
