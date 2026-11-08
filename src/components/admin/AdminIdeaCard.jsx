import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { daysUntil } from '../../lib/dates.js';
import { formatRelativeDays } from '../../lib/format.js';
import { IDEA_DELETE_ACTION, canDeleteIdea, ideaActionsFor, resolveIdeaConfirmation } from '../../lib/adminIdeas.js';
import { SchoolTags, StatusBadge, TopicTags } from '../Badges.jsx';
import Icon from '../Icon.jsx';

const BUTTON_CLASS = { primary: 'btn--primary', secondary: 'btn--secondary', danger: 'btn--danger' };

/**
 * Eine Idee in der Moderations-Liste. Zeigt bewusst KEINE Autor:innen-Daten
 * (admin_list_ideas liefert sie auch gar nicht).
 */
export default function AdminIdeaCard({ idea, confirmingTo, pending, errorKey, onAsk, onCancel, onConfirm }) {
  const { t, language, locale } = useI18n();
  const actions = ideaActionsFor(idea.status);
  const deletable = canDeleteIdea(idea);
  // Offene Bestätigung: Statuswechsel (Ziel-Status) oder Löschen ('delete')
  const confirming = resolveIdeaConfirmation(idea, confirmingTo);
  const title = localize(idea.title, language);

  return (
    <article className="card admin-idea">
      <div className="admin-idea__head">
        <h3 className="admin-idea__title">{title}</h3>
        <StatusBadge type="idea" status={idea.status} />
      </div>

      {idea.summary && <p className="admin-idea__summary">{localize(idea.summary, language)}</p>}
      {idea.description && <p className="admin-idea__text">{localize(idea.description, language)}</p>}
      {idea.topics.length > 0 && <TopicTags topics={idea.topics} />}

      <p className="admin-idea__meta">
        <SchoolTags schoolIds={idea.schoolIds} />
        <span>
          <Icon name="heart" size={14} /> {t('admin.ideas.supporters', { count: idea.supporters })}
        </span>
        {idea.createdAt && (
          <span>
            <Icon name="clock" size={14} />{' '}
            {t('admin.ideas.submittedAt', { date: formatRelativeDays(daysUntil(idea.createdAt), locale) })}
          </span>
        )}
      </p>

      {errorKey && (
        <p className="notice notice--error" role="alert">
          <Icon name="info" size={16} />
          {t(errorKey)}
        </p>
      )}

      {actions.length === 0 && (
        <p className="hint">
          <Icon name="check" size={14} />
          {t('admin.ideas.final')}
        </p>
      )}

      {confirming ? (
        <div
          className={`confirm${confirming.tone === 'danger' ? '' : ' confirm--neutral'}`}
          role="group"
          aria-label={t(confirming.labelKey)}
        >
          <p>{t(confirming.confirmKey, { title })}</p>
          <div className="confirm__actions">
            <button
              type="button"
              className={`btn btn--sm ${BUTTON_CLASS[confirming.tone]}`}
              onClick={() => onConfirm(idea.id, confirming === IDEA_DELETE_ACTION ? 'delete' : confirming.to)}
              disabled={pending}
            >
              {pending ? t('admin.saving') : t(confirming.labelKey)}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={pending}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        (actions.length > 0 || deletable) && (
          <div className="admin-idea__actions" role="group" aria-label={t('admin.actionsLabel', { title })}>
            {actions.map((action) => (
              <button
                key={action.to}
                type="button"
                className={`btn btn--sm ${BUTTON_CLASS[action.tone]}`}
                onClick={() => onAsk(idea.id, action.to)}
                disabled={pending}
              >
                {t(action.labelKey)}
              </button>
            ))}
            {/* Nur nach der Moderation (nicht bei "submitted") – Datenbank prüft zusätzlich (DC010) */}
            {deletable && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAsk(idea.id, 'delete')} disabled={pending}>
                <Icon name="trash" size={16} />
                {t(IDEA_DELETE_ACTION.labelKey)}
              </button>
            )}
          </div>
        )
      )}
    </article>
  );
}
