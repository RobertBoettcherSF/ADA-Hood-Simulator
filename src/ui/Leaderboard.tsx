import { useState } from 'react';
import { clearGameRecords, loadGameRecords } from '../app/localData';
import type { GameRecord } from '../app/save';
import { ConfirmDialog, Modal } from './common';

type Order = 'score' | 'date';

/** Past games, best score first or newest first. */
export function sortGames(games: readonly GameRecord[], order: Order): GameRecord[] {
  return [...games].sort((a, b) => order === 'score' ? b.score - a.score || b.at - a.at : b.at - a.at);
}

/** The main menu's leaderboard: every finished game, kept in the city folder. */
export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [games, setGames] = useState(loadGameRecords);
  const [order, setOrder] = useState<Order>('score');
  const [clearing, setClearing] = useState(false);
  const rows = sortGames(games, order);
  return (
    <Modal
      title="Leaderboard"
      kicker={`Past games · ${games.length}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn" disabled={order === 'score'} onClick={() => setOrder('score')}>Best score</button>
          <button className="btn" disabled={order === 'date'} onClick={() => setOrder('date')}>Newest</button>
          <button className="btn red-text" disabled={!games.length} onClick={() => setClearing(true)}>Clear</button>
          <button className="btn" onClick={onClose}>Exit</button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="muted">No finished games yet. Every game that ends, won or lost, is listed here.</p>
      ) : (
        <table className="leaderboard">
          <thead>
            <tr><th>#</th><th>Boss</th><th>Gang</th><th>Outcome</th><th>Week</th><th>Score</th><th>Date</th></tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={g.resultId} title={g.reason}>
                <td>{i + 1}</td>
                <td>{g.boss}{g.autoTest ? <small className="muted"> (Auto Test)</small> : null}</td>
                <td>{g.gang}</td>
                <td className={g.won ? 'won' : 'lost'}>{g.won ? 'Won' : 'Lost'} — {g.reason}</td>
                <td>{g.week}</td>
                <td><b>{g.score}</b></td>
                <td>{new Date(g.at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {clearing && (
        <ConfirmDialog
          text="Clear the leaderboard? The Hall of Fame is kept."
          onYes={() => { clearGameRecords(); setGames([]); setClearing(false); }}
          onNo={() => setClearing(false)}
        />
      )}
    </Modal>
  );
}
