import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SymbolPairs from '../games/SymbolPairs.jsx';

/** Seite für das Spiel „Symbolpaare“ (Spiel von Kerem, siehe src/games/SymbolPairs.jsx). */
export default function SymbolPairsPage() {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <PageHeader title={t('games.symbolPairs.title')} backTo="/community/games" />
      <SymbolPairs />
      <p className="muted">{t('games.localNote')}</p>
    </div>
  );
}
