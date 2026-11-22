// The four page-language flags.
import React from 'react';
import { Lang } from '../i18n';

export function Flag({ lang }: { lang: Lang }) {
  switch (lang) {
    case 'de':
      return <svg viewBox="0 0 5 3" aria-hidden="true"><path fill="#000" d="M0 0h5v1H0z" /><path fill="#D00" d="M0 1h5v1H0z" /><path fill="#FFCE00" d="M0 2h5v1H0z" /></svg>;
    case 'es':
      return <svg viewBox="0 0 4 3" aria-hidden="true"><path fill="#AA151B" d="M0 0h4v3H0z" /><path fill="#F1BF00" d="M0 .75h4v1.5H0z" /></svg>;
    case 'fr':
      return <svg viewBox="0 0 3 2" aria-hidden="true"><path fill="#002395" d="M0 0h1v2H0z" /><path fill="#fff" d="M1 0h1v2H1z" /><path fill="#ED2939" d="M2 0h1v2H2z" /></svg>;
    default:
      return (
        <svg viewBox="0 0 60 30" aria-hidden="true">
          <clipPath id="gb-a"><path d="M0,0v30h60V0z" /></clipPath>
          <clipPath id="gb-b"><path d="M30,15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
          <g clipPath="url(#gb-a)">
            <path d="M0,0v30h60V0z" fill="#012169" />
            <path d="M0,0L60,30M60,0L0,30" stroke="#fff" strokeWidth="6" />
            <path d="M0,0L60,30M60,0L0,30" clipPath="url(#gb-b)" stroke="#C8102E" strokeWidth="4" />
            <path d="M30,0v30M0,15h60" stroke="#fff" strokeWidth="10" />
            <path d="M30,0v30M0,15h60" stroke="#C8102E" strokeWidth="6" />
          </g>
        </svg>
      );
  }
}
