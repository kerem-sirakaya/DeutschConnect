import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import Icon from '../components/Icon.jsx';
import { useGameLeaderboard } from '../state/useGameLeaderboard.js';
import { LEADERBOARD_GAMES } from '../lib/leaderboard.js';

/**
 * Bestenlisten (Migration 017) – Anzeige NUR auf der Spiele-Übersicht /games, unter den Spiel-Kacheln.
 *
 * Zwei getrennte Listen: „Papierflug – Top 10“ und „Brückenläufer – Top 10“.
 * Datenschutz unverändert: Es erscheinen nur Personen, die „In Bestenlisten anzeigen“ eingeschaltet haben
 * (Standard: aus). Pro Person nur der Bestwert, nur der Vorname. Gleiche Punkte = gleicher Platz.
 * Die Zustimmung gilt für beide Spiele → ein gemeinsamer Haken unter beiden Listen.
 * Abgemeldet: ein Hinweis zum Anmelden, keine erfundenen Einträge.
 *
 * Auf den Spielseiten wird nur noch eingereicht; dort zeigt LeaderboardSaveStatus eine kurze Rückmeldung.
 */
export const LEADERBOARDS_ANCHOR = 'leaderboards';

export default function GameLeaderboards() {
  const { t } = useI18n();
  const flight = useGameLeaderboard(LEADERBOARD_GAMES.paperFlight);
  const runner = useGameLeaderboard(LEADERBOARD_GAMES.bridgeRunner);
  const boards = [
    { key: 'paper-flight', title: t('games.paperFlight.title'), lb: flight },
    { key: 'bridge-runner', title: t('games.bridgeRunner.title'), lb: runner },
  ];
  const isDemo = flight.me.status === 'demo';
  // Zustimmung ist für beide Spiele gleich gespeichert → Stand aus einer der beiden Abfragen
  const me = flight.me.status === 'ready' ? flight.me : runner.me.status === 'ready' ? runner.me : null;
  const busy = flight.visibility.busy || runner.visibility.busy || flight.me.refreshing || runner.me.refreshing;
  const visibilityError = flight.visibility.errorKey;

  async function changeVisibility(visible) {
    // Über eine Abfrage speichern, danach die andere Liste ebenfalls neu laden.
    if (await flight.changeVisibility(visible)) {
      runner.me.reload();
      runner.board.reload();
    }
  }

  return (
    <section className="leaderboards stack" id={LEADERBOARDS_ANCHOR} aria-labelledby="leaderboards-title">
      <div className="leaderboard__head">
        <span className="leaderboard__icon" aria-hidden="true">
          <Icon name="trophy" size={24} />
        </span>
        <div>
          <h2 id="leaderboards-title">{t('games.leaderboard.sectionTitle')}</h2>
          <p className="muted">{t('games.leaderboard.sectionSubtitle')}</p>
        </div>
      </div>

      {isDemo ? (
        <div className="card stack">
          <p>{t('games.leaderboard.loginHint')}</p>
          <div>
            <Link to="/login" className="btn btn--secondary">
              {t('games.leaderboard.login')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="leaderboards__grid">
            {boards.map(({ key, title, lb }) => (
              <LeaderboardCard key={key} id={`leaderboard-${key}`} title={title} leaderboard={lb} />
            ))}
          </div>

          {me && (
            <div className="stack">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={me.data.visible}
                  disabled={busy}
                  onChange={(event) => changeVisibility(event.target.checked)}
                />
                <span>
                  {t('games.leaderboard.showMe')}
                  <span className="leaderboard__hint muted">{t('games.leaderboard.showMeHint')}</span>
                </span>
              </label>
              {visibilityError && (
                <p role="alert" className="notice notice--error">
                  {t(visibilityError)}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Eine Liste (Top 10) mit eigenem Bestwert darunter. */
function LeaderboardCard({ id, title, leaderboard }) {
  const { t } = useI18n();
  const { board, me } = leaderboard;
  return (
    <section className="card stack leaderboard" aria-labelledby={id}>
      <h3 id={id} className="leaderboard__title">
        {t('games.leaderboard.boardTitle', { game: title })}
      </h3>

      {board.status === 'loading' && <p className="muted">{t('games.leaderboard.loading')}</p>}
      {board.status === 'notInstalled' && <p className="muted">{t('games.leaderboard.errors.notInstalled')}</p>}
      {board.status === 'error' && (
        <div className="stack">
          <p role="alert" className="notice notice--error">
            {t(board.errorKey ?? 'games.leaderboard.errors.generic')}
          </p>
          <div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={board.reload}>
              {t('games.leaderboard.retry')}
            </button>
          </div>
        </div>
      )}

      {board.status === 'ready' &&
        (board.data.length ? (
          <ol className="leaderboard__list">
            {board.data.map((row, index) => (
              <li
                key={`${row.rank}-${index}`}
                className={[
                  'leaderboard__row',
                  row.rank <= 3 && `leaderboard__row--top leaderboard__row--rank${row.rank}`,
                  row.isSelf && 'leaderboard__row--self',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="leaderboard__rank">
                  <span className="visually-hidden">{t('games.leaderboard.rankLabel')} </span>
                  {row.rank}
                </span>
                <span className="leaderboard__name">
                  {row.displayName}
                  {row.isSelf && <span className="badge badge--info">{t('games.leaderboard.you')}</span>}
                </span>
                <span className="leaderboard__score">
                  {row.score}
                  <span className="visually-hidden"> {t('games.leaderboard.points')}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="leaderboard__empty muted">{t('games.leaderboard.empty')}</p>
        ))}

      {me.status === 'ready' && (
        <p className="leaderboard__me">
          {me.data.bestScore == null
            ? t('games.leaderboard.noBestYet')
            : t('games.leaderboard.myBest', { score: me.data.bestScore })}
          {me.data.rank != null && ` · ${t('games.leaderboard.myRank', { rank: me.data.rank })}`}
        </p>
      )}
    </section>
  );
}

/**
 * Kurze Rückmeldung auf der Spielseite nach einer Runde (gespeichert / bleibt / abgelehnt)
 * mit Link zu den Bestenlisten. Keine Liste – die steht nur auf /games.
 */
export function LeaderboardSaveStatus({ leaderboard }) {
  const { t } = useI18n();
  const { save, me } = leaderboard;
  if (me.status === 'demo') {
    return (
      <p className="muted leaderboard-status">
        {t('games.leaderboard.loginHintShort')}{' '}
        <Link to={`/community/games#${LEADERBOARDS_ANCHOR}`}>{t('games.leaderboard.viewAll')}</Link>
      </p>
    );
  }
  return (
    <div className="leaderboard-status">
      <p role="status" className="leaderboard__save">
        {save.status === 'saving' && t('games.leaderboard.saving')}
        {save.status === 'newBest' && t('games.leaderboard.newBest', { score: save.score })}
        {save.status === 'kept' && t('games.leaderboard.kept', { score: save.score })}
        {save.status === 'error' && t(save.errorKey ?? 'games.leaderboard.errors.generic')}
      </p>
      <p className="muted">
        {me.status === 'ready' && me.data.bestScore != null && `${t('games.leaderboard.myBest', { score: me.data.bestScore })} · `}
        <Link to={`/community/games#${LEADERBOARDS_ANCHOR}`}>{t('games.leaderboard.viewAll')}</Link>
      </p>
    </div>
  );
}
