import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ChessGame from '../games/ChessGame.jsx';

/** Seite für Schach zu zweit am selben Gerät (Spiel von Kerem, siehe src/games/ChessGame.jsx). */
export default function ChessPage() {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <PageHeader title={t('games.chess.title')} backTo="/games" />
      <ChessGame />
      <p className="muted">{t('games.localNote')}</p>
    </div>
  );
}
