import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getSchool } from '../data/schools.js';
import { daysUntil } from '../lib/dates.js';
import { formatRelativeDays } from '../lib/format.js';
import { ideaProgressSteps, ownIdeaNotice } from '../lib/ideaProgress.js';
import PageHeader from '../components/PageHeader.jsx';
import InfoList from '../components/InfoList.jsx';
import SupportButton from '../components/SupportButton.jsx';
import Icon from '../components/Icon.jsx';
import { DemoBadge, StatusBadge, TopicTags } from '../components/Badges.jsx';
import ProjectParticipation from '../components/projects/ProjectParticipation.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function IdeaDetailPage() {
  const { ideaId } = useParams();
  const { t, language, locale } = useI18n();
  const { user, ideas, actions, isRealAccount } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const idea = ideas.find((i) => i.id === ideaId);

  if (!idea) return <NotFoundPage titleKey="ideaDetail.notFound" backTo="/ideas" />;

  const isOwn = idea.authorId === user.id;
  const justCreated = location.state?.created && isOwn;
  const steps = ideaProgressSteps(idea.status);
  const school = getSchool(idea.schoolId);
  // Echtes Konto, eigene Idee: "wartet auf Freigabe" (submitted) oder "nicht freigegeben" (rejected).
  // In beiden Fällen sehen andere die Idee nicht.
  const notice = ownIdeaNotice({ status: idea.status, isOwn, isRealAccount });
  const canDelete = isOwn && (idea.isLocal || isRealAccount);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await actions.deleteIdea(idea.id);
    setDeleting(false);
    if (result.errorKey) {
      setDeleteError(result.errorKey);
      return;
    }
    navigate('/ideas?tab=mine', { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title={localize(idea.title, language)} backTo="/ideas" />

      {justCreated && (
        <div className="notice notice--success" role="status">
          <Icon name="check" size={18} />
          <div>
            <strong>{t('ideaDetail.created')}</strong>
            <p>{t(isRealAccount ? 'ideaDetail.createdHintAccount' : 'ideaDetail.createdHint')}</p>
          </div>
        </div>
      )}

      {notice === 'awaitingApproval' && !justCreated && (
        <p className="notice notice--demo" role="status">
          <Icon name="clock" size={16} />
          <span>{t('ideaDetail.awaitingApproval')}</span>
        </p>
      )}

      {notice === 'rejected' && (
        <div className="notice notice--error" role="status">
          <Icon name="info" size={18} />
          <div>
            <strong>{t('status.idea.rejected')}</strong>
            <p>{t('ideaDetail.rejectedText')}</p>
          </div>
        </div>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <div className="badge-row">
            <StatusBadge type="idea" status={idea.status} />
            {isOwn && <span className="badge badge--role">{t('ideas.yourIdea')}</span>}
            {idea.isDemo && <DemoBadge />}
          </div>

          <InfoList
            items={[
              {
                icon: 'school',
                label: t('ideaDetail.from'),
                value: isOwn ? t('ideaDetail.fromYou') : t('ideaDetail.fromStudentOf', { school: school?.name ?? '' }),
              },
              {
                icon: 'clock',
                label: t('ideaDetail.submitted'),
                value: formatRelativeDays(daysUntil(idea.createdAt), locale),
              },
              { icon: 'tag', label: t('eventDetail.format'), value: t(`formats.${idea.format}`) },
              {
                icon: 'network',
                label: t('ideaDetail.targetSchools'),
                // nur sichtbare Schulen (getSchool liefert für ausgeblendete nichts) – kein „ERS, “
                value: idea.schoolIds.map((id) => getSchool(id)?.name).filter(Boolean).join(', '),
              },
            ]}
          />

          <section className="detail-section">
            <h2>{t('ideaDetail.about')}</h2>
            <p className="pre-line">{localize(idea.description, language)}</p>
            <TopicTags topics={idea.topics} highlight={user.interests} />
          </section>

          <section className="detail-section">
            <h2>{t('ideaDetail.progress')}</h2>
            <ol className="stepper" style={{ '--stepper-count': steps.length }}>
              {steps.map((step, index) => {
                const isCurrent = step.state === 'current' || step.state === 'rejected';
                return (
                  <li
                    key={step.id}
                    className={`stepper__step${step.state === 'done' ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}${
                      step.state === 'rejected' ? ' is-rejected' : ''
                    }`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="stepper__dot">
                      {step.state === 'done' && <Icon name="check" size={14} />}
                      {step.state === 'rejected' && <Icon name="close" size={14} />}
                      {(step.state === 'current' || step.state === 'upcoming') && index + 1}
                    </span>
                    <span className="stepper__label">{t(step.labelKey)}</span>
                  </li>
                );
              })}
            </ol>
            <p className="hint">
              <Icon name="info" size={14} />
              {t('ideaDetail.approvalNote')}
            </p>
          </section>
        </div>

        <aside className="detail-aside card">
          <h2>{t('ideaDetail.supportTitle')}</h2>
          <p className="muted">{isOwn ? t('ideaDetail.ownIdeaNote') : t('ideaDetail.supportText')}</p>
          <SupportButton idea={idea} />

          <ProjectParticipation idea={idea} />

          {canDelete && (
            <div className="danger-zone">
              {deleteError && (
                <p className="notice notice--error" role="alert">
                  <Icon name="info" size={16} />
                  {t(deleteError)}
                </p>
              )}
              {!confirmDelete ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={16} />
                  {t('ideaDetail.delete')}
                </button>
              ) : (
                <div className="confirm" role="group" aria-label={t('ideaDetail.delete')}>
                  <p>{t('ideaDetail.deleteConfirm')}</p>
                  <div className="confirm__actions">
                    <button type="button" className="btn btn--danger btn--sm" onClick={handleDelete} disabled={deleting}>
                      {deleting ? t('auth.loading') : t('ideaDetail.deleteYes')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Link to="/ideas/new" className="btn btn--secondary btn--block">
            <Icon name="plus" size={18} />
            {t('ideas.newIdea')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
