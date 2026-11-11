import { useEffect } from 'react';
import { useGame } from '../app/store';
import { audio } from '../audio/audio';
import { streetActionHot } from '../audio/streetAction';
import { ORDERS } from '../sim/constants';
import { AttractMode } from './AttractMode';
import { Blueprint } from './Blueprint';
import { BuildingPanel } from './BuildingPanel';
import { CityView } from './CityView';
import { ConfirmDialog } from './common';
import { HelpSheet } from './HelpSheet';
import { Organizer } from './organizer/Organizer';
import { WeekHud } from './WeekHud';
import { useGameKeyboard } from './useGameKeyboard';
import { preloadLoadingArt } from './StreetLoading';

export function GameScreen() {
  const sim = useGame((s) => s.sim);
  const jobCard = useGame((s) => s.jobCard);
  const staff = useGame(s => s.specialistCard);
  const pickMode = useGame((s) => s.pickMode);
  const planningView = useGame((s) => s.planningView);
  const helpOpen = useGame((s) => s.helpOpen);
  const setHelpOpen = useGame((s) => s.setHelpOpen);
  const quitPrompt = useGame((s) => s.quitPrompt);
  const savingToQuit = useGame((s) => s.savingToQuit);
  const savingSnapshot = useGame((s) => s.savingSnapshot);
  const streetLoading = useGame((s) => s.streetLoading);
  const setQuitPrompt = useGame((s) => s.setQuitPrompt);
  const saveAndQuit = useGame((s) => s.saveAndQuit);
  useGame((s) => s.version);
  const attract = useGame((s) => s.attract);
  const resolving = useGame((s) => s.resolvingHeadless);
  const weekProgress = useGame((s) => s.weekProgress);

  useEffect(() => {
    audio.startMusic();
    preloadLoadingArt();
    return () => audio.stopMusic();
  }, []);
  // Planner and street each have their own shuffle. A lesson loops the tutorial pair instead.
  const phase = useGame((s) => s.sim?.world.phase);
  const tutorial = useGame((s) => s.sim?.world.options.tutorialId != null);
  useEffect(() => {
    if (tutorial) { audio.music('tutorial'); return; }
    if (phase === 'week') audio.music('week');
    else if (phase === 'planning') audio.music('planning');
  }, [phase, tutorial]);
  // A shootout, raid, or chase on the street crossfades to an action song, then back about 10s later.
  useEffect(() => {
    if (phase !== 'week') return;
    let hot = false;
    let timer = 0;
    const id = window.setInterval(() => {
      const world = useGame.getState().sim?.world;
      if (!world) return;
      const now = streetActionHot(world);
      if (now) {
        window.clearTimeout(timer);
        if (!hot) audio.music('action');
        hot = true;
        return;
      }
      if (!hot) return;
      hot = false;
      const back = world.options.tutorialId != null ? 'tutorial' : 'week';
      timer = window.setTimeout(() => audio.music(back), 10_000);
    }, 500);
    return () => { window.clearInterval(id); window.clearTimeout(timer); };
  }, [phase]);

  useGameKeyboard();

  if (!sim) return null;
  if (resolving) {
    return (
      <div className="week-resolve" role="status">
        <div className="paper sheet">
          <h2>The week is being settled</h2>
          <p>Week {sim.world.week}, minute {sim.world.minute}. The city is not on screen. The same clock is running.</p>
          <div className="week-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(weekProgress * 100)}>
            <i style={{ width: `${Math.round(weekProgress * 100)}%` }} />
          </div>
          <p>{Math.round(weekProgress * 100)}% of the week settled.</p>
        </div>
      </div>
    );
  }
  const planning = sim.world.phase === 'planning';
  if (attract) return <div className="game-shell working-interface attract-shell"><CityView /><AttractMode /></div>;

  const hint = (() => {
    if (jobCard) {
      const target = ORDERS[jobCard.type].target;
      if (target === 'area') return 'Click or drag to select; repeat over a selected area to clear · Shift-click a single site · Esc cancels';
      if (target === 'building') return 'Click the site on the map · Esc cancels the job card';
      if (target === 'person') return 'Pick the person from the Clipboard · Esc cancels the job card';
      if (target === 'point') return 'Click where they should go · Esc cancels the job card';
      return 'Confirm the order on the card · Esc cancels';
    }
    if (pickMode?.kind === 'lieutenantArea') return 'Click a block to give it to this crew, again to take it back · Esc when done';
    if (pickMode?.kind === 'policeArea') return 'Click the blocks the lawyer should tour, again to drop one · confirm on the Lawyer page · Esc when done';
    if (pickMode?.kind === 'specialist') return 'Choose a highlighted person or premises, or use the Clipboard · Esc cancels';
    if (pickMode?.kind === 'streetOrder')
      return pickMode.orderType === 'goTo' ? 'Click where they should go · Esc cancels' : 'Click the person to target · Esc cancels';
    return null;
  })();

  return (
    <div className={`game-shell ${planning?'planning-interface':'working-interface'}`} onPointerDown={() => audio.ensure()}>
      <CityView />
      {planning && planningView === 'plan' && <Blueprint />}

      {planning ? <Organizer /> : <WeekHud />}
      {planning && !jobCard && !staff && <BuildingPanel />}
      {!planning && <BuildingPanel />}

      {(savingToQuit || savingSnapshot) && !streetLoading && <div className="modal-back" role="status"><div className="paper sheet">Saving your city…</div></div>}
      {hint && !jobCard && !staff && !(planning && planningView === 'plan' && pickMode?.kind === 'lieutenantArea') && <div className="paper hint-pill">{hint}</div>}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {quitPrompt && (
        <ConfirmDialog
          text="Leave this city and go back to the desk? The Autosave slot will keep your place."
          onYes={() => { void saveAndQuit(); }}
          onNo={() => setQuitPrompt(false)}
        />
      )}
    </div>
  );
}
