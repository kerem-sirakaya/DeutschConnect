import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PaperFlight from '../games/PaperFlight.jsx';
import { LeaderboardSaveStatus } from '../games/GameLeaderboards.jsx';
import { useGameLeaderboard } from '../state/useGameLeaderboard.js';
import { LEADERBOARD_GAMES } from '../lib/leaderboard.js';

/**
 * Seite für das Spiel „Papierflug“ (Spiel von Kerem, siehe src/games/PaperFlight.jsx).
 * Bestwerte werden hier eingereicht (017); die Bestenliste selbst steht auf /games.
 */
export default function PaperFlightPage() {
  const { t } = useI18n();
  const leaderboard = useGameLeaderboard(LEADERBOARD_GAMES.paperFlight, { loadBoard: false });
  return (
    <div className="page page--narrow">
      <PageHeader title={t('games.paperFlight.title')} backTo="/community/games" />
      <PaperFlight onRoundStart={leaderboard.roundStarted} onRoundEnd={leaderboard.roundEnded} />
      <LeaderboardSaveStatus leaderboard={leaderboard} />
      <p className="muted">{t('games.localNote')}</p>
    </div>
  );
}
