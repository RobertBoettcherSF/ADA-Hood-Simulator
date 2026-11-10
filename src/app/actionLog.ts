/** The last few things the player did, for the debug report. */
export interface UserAction {
  at: string;
  kind: string;
  detail: string;
}

const actions: UserAction[] = [];

export function recordAction(kind: string, detail: string): void {
  const at = new Date().toISOString().slice(11, 19);
  actions.push({ at, kind, detail: detail.replace(/\s+/g, ' ').trim().slice(0, 140) });
  if (actions.length > 20) actions.shift();
}

export function recentActions(): readonly UserAction[] {
  return actions;
}
