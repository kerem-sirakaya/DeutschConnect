import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { canSupportIdea } from '../lib/ideasApi.js';
import Icon from './Icon.jsx';

/**
 * Unterstützen-Button für Ideen. Eigene Ideen kann man nicht selbst unterstützen.
 * Echtes Konto: zusätzlich nur freigegebene Ideen (die Datenbank prüft das ebenfalls –
 * das Ausblenden hier ist nur Komfort, keine Sicherheit).
 */
export default function SupportButton({ idea, compact = false }) {
  const { t, language } = useI18n();
  const { user, supportCounts, actions, isRealAccount, ideaSync } = useAppState();
  const count = supportCounts[idea.id] ?? 0;
  const isOwn = idea.authorId === user.id;
  const supported = user.supportedIdeas.includes(idea.id);
  const countLabel = t('ideas.supportCount', { count });
  const saving = Boolean(ideaSync.pending[idea.id]);
  const errorKey = ideaSync.error?.ideaId === idea.id ? ideaSync.error.key : null;

  if (isOwn || (isRealAccount && !canSupportIdea(idea, user.id))) {
    return (
      <span className="support-count">
        <Icon name="heart" size={16} />
        {countLabel}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`support-button${supported ? ' is-active' : ''}${compact ? ' support-button--compact' : ''}`}
        aria-pressed={supported}
        aria-busy={saving}
        disabled={saving}
        aria-label={`${t('ideas.supportAria', { title: localize(idea.title, language) })} – ${countLabel}`}
        onClick={() => actions.toggleIdeaSupport(idea.id)}
      >
        <Icon name="heart" size={16} />
        <span>{saving ? t('auth.loading') : supported ? t('ideas.supported') : t('ideas.support')}</span>
        <span className="support-button__count">{count}</span>
      </button>
      {errorKey && (
        <span role="alert" className={compact ? 'visually-hidden' : 'field__error'}>
          {t(errorKey)}
        </span>
      )}
    </>
  );
}
