import { useGame } from '../../app/store';

export function LieutenantAreaControls() {
  const sim = useGame(s => s.sim), mode = useGame(s => s.pickMode);
  const selectTeam = useGame(s => s.selectTeam), toggleOverlay = useGame(s => s.toggleOverlay);
  useGame(s => s.version);
  if (!sim || mode?.kind !== 'lieutenantArea') return null;
  const w = sim.world, team = w.teams[mode.teamId];
  if (!team) return null;
  return <>
    <label className="row">Lieutenant <select aria-label="Area lieutenant" className="text-input"
      value={team.id} onChange={e => selectTeam(Number(e.target.value))}>
      {sim.playerGang.teamIds.map(id => w.teams[id]).filter(Boolean).map(t =>
        <option key={t.id} value={t.id}>{w.people[t.lieutenantId]?.name ?? t.name}</option>)}
    </select></label>
    <span role="status" data-help="lieutenant’s area" title="Blocks this crew looks after">{team.allocatedBlockIds.length} allocated block{team.allocatedBlockIds.length === 1 ? '' : 's'}</span>
    <button className="btn sm" title="Finish picking this crew's blocks" onClick={() => toggleOverlay('lieutenant')}>Done allocating</button>
  </>;
}
