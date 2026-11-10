import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import GameLeaderboards, { LEADERBOARDS_ANCHOR } from '../games/GameLeaderboards.jsx';

/**
 * Spiele-Übersicht – eigener Hauptbereich „Spiele“ (/games) in der Navigation.
 *
 * Die Spiele stammen von Kerem (Codex-Version, Branch `codex-version-1.0`, `src/pages/Games.jsx`).
 * Stand: Alle vier Spiele sind eingebaut (Stufe 8a) – nur im Browser, kein Online-Schach.
 * Unter den Kacheln: Bestenlisten für Papierflug und Brückenläufer (Stufe 8b, Migration 017).
 */

export default function GamesPage() {
  const { t } = useI18n();
  const { hash } = useLocation();

  // Link „Zu den Bestenlisten“ von einer Spielseite (/games#leaderboards): dorthin scrollen.
  // Erst im nächsten Bild – AppShell scrollt bei jedem Seitenwechsel nach oben, und dessen Effekt
  // läuft nach diesem (Eltern-Effekte laufen nach Kind-Effekten).
  useEffect(() => {
    if (hash !== `#${LEADERBOARDS_ANCHOR}`) return undefined;
    const frame = requestAnimationFrame(() => document.getElementById(LEADERBOARDS_ANCHOR)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="page">
      <PageHeader title={t('games.title')} subtitle={t('games.subtitle')} />

      <div className="hub-grid">
        <Link to="/games/symbol-pairs" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="sparkles" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('games.symbolPairs.title')}</span>
            <span className="hub-card__text">{t('games.symbolPairs.hint')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <Link to="/games/paper-flight" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="arrowRight" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('games.paperFlight.title')}</span>
            <span className="hub-card__text">{t('games.paperFlight.hint')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <Link to="/games/bridge-runner" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="refresh" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('games.bridgeRunner.title')}</span>
            <span className="hub-card__text">{t('games.bridgeRunner.hint')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <Link to="/games/chess" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="users" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('games.chess.title')}</span>
            <span className="hub-card__text">{t('games.chess.hint')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </div>

      <p className="muted">{t('games.localNote')}</p>

      <GameLeaderboards />
    </div>
  );
}
