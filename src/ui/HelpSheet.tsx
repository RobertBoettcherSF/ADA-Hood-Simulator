import { TUTORIALS } from '../app/tutorials';
import { Modal } from './common';

/** The short briefing from the main menu, also opened in the game with `?`. */
export function HelpSheet({ onClose, onStartLesson }: { onClose: () => void; onStartLesson?: (id: number) => void }) {
  return (
    <Modal title="How to Play" kicker="A short briefing · four pages" onClose={onClose} width={900}>
      <p style={{ fontSize: 15, margin: '0 0 16px', lineHeight: 1.5 }}>
        You run one of four gangs in Saint Volstead. The game alternates between two phases.
      </p>
      <p>Use Tab and Shift+Tab to move between controls, Enter or Space to activate them,
        and the arrow keys to change Organizer tabs. Choose on map lets you search for
        people, sites and blocks to select targets without using the canvas. Dialogs keep
        keyboard focus inside them; Escape closes them and returns to the previous control.</p>
      <div className="help-grid">
        <div>
          <h4>The Gang Organizer</h4>
          <p>
            Turn-based, with all the time you want. Organise your crews, buy weapons and premises, bribe officials,
            and give each lieutenant their orders for the coming week. Each order consumes part of that
            lieutenant's week — watch the dial beside their name.
          </p>
        </div>
        <div>
          <h4>The Working Week</h4>
          <p>
            Monday to Friday plays out in real time. Your hoods carry out their orders while the police, the FBI
            and three rival gangs go about their business. You can speed time up, follow anyone, and give live
            orders on the street — kill, assault, tail or go to. Select a person to open a Tagged Window:
            it follows them while you explore elsewhere. Its Street/Rooftop toggle is independent of the main
            view; Center View brings the main camera back to them. Roofs open automatically in Street View.
            Use Remove buildings (B) to expose all the pavements. The top icon bar opens Tagged Characters;
            People and Orders switch the list, and Clear Tagged Windows closes the character view.
            The clock and its speed controls are at the bottom right. Use &lt; and &gt; to change speed.
            P pauses the week. Message buttons (F5–F8) open reports;
            the separate filters inside the Message Box control which reports slow accelerated time.
          </p>
        </div>
        <div>
          <h4>Winning</h4>
          <p>
            Eliminate every rival gang, get yourself elected Mayor, or accumulate $250,000 in clean assets and go
            straight. Lose by being killed, convicted, bankrupted, or beaten to the mayoralty.
          </p>
        </div>
        <div>
          <h4>The one rule that matters</h4>
          <p>
            Illegal businesses earn far more than legal ones, but they must sit in the centre lot of a block,
            behind a legal front you also own — and the closer the front matches the trade, the longer the FBI
            takes to find it. Money you cannot explain is what puts you in prison.
          </p>
        </div>
      </div>
      {onStartLesson && (
        <div className="help-lessons">
          <h4>Four lessons</h4>
          <p className="muted">Each starts a quiet city with a card of things to do, ticked off as you do them.</p>
          <div className="row wrap" style={{ gap: 6 }}>
            {TUTORIALS.map((t) => (
              <button key={t.id} className="btn" title={t.blurb} onClick={() => onStartLesson(t.id)}>
                {t.id}. {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="help-keys">
        <h4>Keys</h4>
        <p>
          <b>Organizer:</b> F1–F8 sections · 1–8 lieutenants · C clipboard · H hoods · V vehicles · W weapons ·
          Enter confirms a job card · Esc cancels · Ctrl+S save · Ctrl+L load · Ctrl+Q quit · ? this sheet
        </p>
        <p>
          <b>Working week:</b> P pause · Insert / Home / Page Up for City Plan, Rooftop, Street · Space toggles Street
          and Rooftop · 1–8 cycle a crew's people · &lt; &gt; time · B hide/show buildings · F flip the view · F1–F4 street orders
          (Kill, Assault, Tail, Go To) · F5–F8 message boxes · Esc cancel · Ctrl+Q quit
        </p>
      </div>
    </Modal>
  );
}
