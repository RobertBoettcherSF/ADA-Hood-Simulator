// The title page's menu (1.2.91's, written fresh). Live in step 5: New game
// and Continue (the game in this browser session). Hall of Fame and the
// Leaderboard come in step 8; Load game, Continue across visits, How to play
// and Credits have no step yet; Tutorials are out of scope (DESIGN 8).
import React from 'react';
import { Key } from '../i18n';

type T = (key: Key, vars?: Record<string, string | number>) => string;

export function StartMenu({ t, canContinue, ready, onContinue, onNew }: {
  t: T; canContinue: boolean; ready: boolean; onContinue: () => void; onNew: () => void;
}) {
  const later = (k: Key, note: string) => (
    <button key={k} className="menu-item" disabled title={note}><span>{t(k)}</span><small>{note}</small></button>
  );
  return (
    <div className="overlay open start-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div className="box">
        <h2 id="menu-title">{t('title')}</h2>
        <p className="menu-sub">{t('subtitle')}</p>
        <nav className="menu-list">
          <button className="menu-item live" disabled={!canContinue} onClick={onContinue} autoFocus={canContinue}>
            <span>{t('m_continue')}</span>{!canContinue && <small>{t('m_this_session')}</small>}</button>
          <button className="menu-item live" disabled={!ready} onClick={onNew} autoFocus={!canContinue}><span>{t('m_new')}</span></button>
          {later('m_load', t('m_unassigned'))}
          {later('m_tutorials', t('m_out'))}
          {later('m_hof', t('later', { n: 8 }))}
          {later('m_leaderboard', t('later', { n: 8 }))}
          {later('m_how', t('m_unassigned'))}
          {later('m_credits', t('m_unassigned'))}
        </nav>
      </div>
    </div>
  );
}
