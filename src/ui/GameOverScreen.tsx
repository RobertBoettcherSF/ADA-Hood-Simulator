import { ArtImage } from './ArtImage';
import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import { recordHallOfFame } from '../app/save';
import { useGame } from '../app/store';
import { gangManpower, territoryCount, money } from '../sim/world';
import { MASTHEADS, art } from './art';
import { HallOfFame } from './HallOfFame';
import { useWindowKey } from './input';

/** The week's paper, with the boss's fate across the front page and a brass medal for the score. */
export function GameOverScreen({ recordResult = true }: { recordResult?: boolean } = {}) {
  const sim = useGame((s) => s.sim);
  const setScreen = useGame((s) => s.setScreen);
  // Manual p.82: a short victory or defeat sequence comes before the score paper.
  const [intro, setIntro] = useState(recordResult);
  const [hall, setHall] = useState(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (sim && recordResult) setEntered(recordHallOfFame(sim.world));
  }, [sim, recordResult]);
  const won = sim?.world.outcome?.won;
  useEffect(() => {
    if (won == null) return;
    audio.music(won ? 'win' : 'loss');
  }, [won]);

  if (!sim || !sim.world.outcome) {
    return (
      <div className="desk key-art">
        <div className="paper gameover-sheet" style={{ textAlign: 'center' }}>
          <h1 className="h-cond" style={{ fontSize: 64 }}>
            Fin
          </h1>
          <div className="gameover-actions">
            <button className="btn brass lg" onClick={() => setScreen('menu')}>
              Main menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const w = sim.world;
  const gang = sim.playerGang;
  const outcome = w.outcome!;
  const boss = w.people[gang.bossId];

  if (intro) return <EndingSequence won={outcome.won} boss={boss?.name ?? gang.name} reason={outcome.reason} onDone={() => setIntro(false)} />;

  return (
    <div className="desk key-art">
      <div className="paper gameover-sheet">
        <div className="masthead">
          <ArtImage className="masthead-img" src={MASTHEADS[0]} alt="Saint Volstead Herald" />
          <div className="meta">
            <span>Special edition · Week {w.week}</span>
            <span>Final</span>
            <span>Two cents</span>
          </div>
        </div>
        <div className="gameover-body">
          <div>
            <h1>{outcome.won ? 'The City Is Yours' : 'It Ends Here'}</h1>
            <div className="reason">
              {outcome.reason}
              {outcome.won && boss ? ` Saint Volstead answers to ${boss.name}.` : ''}
            </div>
            <div className="gameover-stats">
              <div>
                <b>{w.week}</b>
                <div className="kicker" style={{ marginTop: 4 }}>
                  Weeks
                </div>
              </div>
              <div>
                <b>{territoryCount(w, gang.id)}</b>
                <div className="kicker" style={{ marginTop: 4 }}>
                  Blocks
                </div>
              </div>
              <div>
                <b>{gangManpower(w, gang)}</b>
                <div className="kicker" style={{ marginTop: 4 }}>
                  Men
                </div>
              </div>
              <div>
                <b>{money(gang.cash)}</b>
                <div className="kicker" style={{ marginTop: 4 }}>
                  Cash
                </div>
              </div>
            </div>
          </div>
          <div className="medal">
            <div className={`medal-art ${outcome.won ? 'victory' : 'defeat'}`}>
              <ArtImage src={art(outcome.won ? 'endings/medal-victory.png' : 'endings/medal-defeat.png')} alt="" />
              <div className="score">
                <b>{outcome.score}</b>
                <span>out of 100</span>
              </div>
            </div>
            {entered && <div className="kicker">Entered in the Hall of Fame</div>}
          </div>
        </div>
        <div className="gameover-actions">
          <button className="btn brass lg" onClick={() => setScreen('menu')}>
            Main menu
          </button>
          <button className="btn lg" onClick={() => setScreen('newGame')}>
            New Game
          </button>
          <button className="btn lg" onClick={() => setHall(true)}>
            Hall of Fame
          </button>
        </div>
        {hall && <HallOfFame onClose={() => setHall(false)} />}
      </div>
    </div>
  );
}

/** Manual p.82: the short ending sequence before the score newspaper. It
 * advances by itself after a few seconds; a click or key skips it. */
export function EndingSequence({ won, boss, reason, onDone }: { won: boolean; boss: string; reason: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4500);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  useWindowKey(() => onDone());
  return (
    <div className={`ending-sequence ${won ? 'won' : 'lost'}`} role="status" aria-live="polite" onClick={onDone}>
      <div className="ending-card">
        <div className="ending-kicker">{won ? 'Saint Volstead, 1932' : 'The end of the line'}</div>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <div className="ending-boss">{boss}</div>
        <p>{reason}</p>
        <div className="ending-hint">Click to read the papers</div>
      </div>
    </div>
  );
}
