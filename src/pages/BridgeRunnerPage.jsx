import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import BridgeRunner from '../games/BridgeRunner.jsx';
import { LeaderboardSaveStatus } from '../games/GameLeaderboards.jsx';
import { useGameLeaderboard } from '../state/useGameLeaderboard.js';
import { LEADERBOARD_GAMES } from '../lib/leaderboard.js';

/**
 * Seite für das Spiel „Brückenläufer“ (Spiel von Kerem, siehe src/games/BridgeRunner.jsx).
 * Bestwerte werden hier eingereicht (017); die Bestenliste selbst steht auf /games.
 */
export default function BridgeRunnerPage() {
  const { t } = useI18n();
  const leaderboard = useGameLeaderboard(LEADERBOARD_GAMES.bridgeRunner, { loadBoard: false });
  return (
    <div className="page page--narrow">
      <PageHeader title={t('games.bridgeRunner.title')} backTo="/community/games" />
      <BridgeRunner onRoundStart={leaderboard.roundStarted} onRoundEnd={leaderboard.roundEnded} />
      <LeaderboardSaveStatus leaderboard={leaderboard} />
      <p className="muted">{t('games.localNote')}</p>
    </div>
  );
}
