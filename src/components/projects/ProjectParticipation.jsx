import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { getSchool } from '../../data/schools.js';
import { useProjectParticipation } from '../../state/useProjects.js';
import { isProjectOpen, primaryAction, splitTeam } from '../../lib/projects.js';
import Icon from '../Icon.jsx';

const TONES = { requested: 'warning', member: 'success', declined: 'danger', left: 'muted' };

/**
 * Mitwirkung an einem Projekt (= veröffentlichte Idee), Ablauf wie in der Codex-Version:
 * anfragen → Autor:in nimmt an/lehnt ab → Mitglied → austreten. Daten: Migration 013.
 * Namen sehen nur Autor:in und Mitglieder; alle anderen nur die Anzahl.
 */
export default function ProjectParticipation({ idea }) {
  const { t } = useI18n();
  const project = useProjectParticipation(idea.id);
  const [errorKey, setErrorKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);

  if (project.status === 'demo') {
    if (!isProjectOpen(idea)) return null;
    return (
      <section className="project-participation" aria-labelledby="project-participation">
        <h2 id="project-participation">{t('projects.title')}</h2>
        <p className="muted">{t('projects.demoHint')}</p>
        <Link to="/login" className="text-link">
          {t('projects.loginLink')}
        </Link>
      </section>
    );
  }
  if (project.status === 'loading') {
    return (
      <p className="notice" role="status">
        <Icon name="refresh" size={16} />
        {t('projects.loading')}
      </p>
    );
  }
  if (project.status !== 'ready') {
    return (
      <p className="notice notice--error" role="alert">
        <Icon name="info" size={16} />
        {t(project.errorKey ?? 'projects.errors.generic')}
      </p>
    );
  }

  const overview = project.data?.overview;
  if (!overview) return null; // Idee für mich nicht sichtbar
  const { members, requests } = splitTeam(project.data.team);
  const action = primaryAction(overview, idea);
  const busy = project.busy || project.refreshing;

  const act = async (operation, successKey) => {
    setErrorKey(null);
    setSavedKey(null);
    const result = await operation();
    if (result.errorKey) setErrorKey(result.errorKey);
    else setSavedKey(successKey);
  };

  return (
    <section className="project-participation" aria-labelledby="project-participation" aria-busy={busy}>
      <h2 id="project-participation">{t('projects.title')}</h2>
      <p className="muted">{t('projects.memberCount', { count: overview.memberCount })}</p>

      {!overview.isOwner && overview.myStatus && (
        <span className={`badge badge--${TONES[overview.myStatus]}`}>{t(`projects.myStatus.${overview.myStatus}`)}</span>
      )}

      {action && (
        <button
          type="button"
          className={`btn btn--block ${action === 'request' ? 'btn--primary' : 'btn--secondary'}`}
          disabled={busy}
          onClick={() =>
            act(project.actions[action], action === 'request' ? 'projects.saved.requested' : `projects.saved.${action}`)
          }
        >
          {t(`projects.actions.${action}`)}
        </button>
      )}
      {!overview.isOwner && !action && !isProjectOpen(idea) && <p className="muted small">{t('projects.closed')}</p>}

      {overview.isOwner && (
        <div className="stack">
          <h3>{t('projects.requestsTitle')}</h3>
          {requests.length === 0 ? (
            <p className="muted small">{t('projects.noRequests')}</p>
          ) : (
            <ul className="team-list">
              {requests.map((person) => (
                <li key={person.userId} className="team-list__item">
                  <PersonName person={person} />
                  <span className="team-list__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy || !isProjectOpen(idea)}
                      onClick={() => act(() => project.actions.review(person.userId, true), 'projects.saved.accepted')}
                    >
                      {t('projects.actions.accept')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy || !isProjectOpen(idea)}
                      onClick={() => act(() => project.actions.review(person.userId, false), 'projects.saved.declined')}
                    >
                      {t('projects.actions.decline')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(overview.isOwner || overview.myStatus === 'member') && (
        <div className="stack">
          <h3>{t('projects.teamTitle')}</h3>
          {members.length === 0 ? (
            <p className="muted small">{t('projects.noMembers')}</p>
          ) : (
            <ul className="team-list">
              {members.map((person) => (
                <li key={person.userId} className="team-list__item">
                  <PersonName person={person} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {errorKey && (
        <p className="notice notice--error" role="alert">
          {t(errorKey)}
        </p>
      )}
      <p className="muted small" role="status">
        {savedKey ? t(savedKey) : ''}
      </p>
      <p className="muted small">{t('projects.privacyHint')}</p>
    </section>
  );
}

function PersonName({ person }) {
  const school = getSchool(person.schoolId);
  return (
    <span className="team-list__name">
      {/* Profil zeigt nur Freigegebenes; ohne Freigabe erscheint "nicht verfügbar" */}
      <Link to={`/community/people/${person.userId}`} className="text-link">
        {person.firstName}
      </Link>
      {school && <span className="muted"> · {school.shortName}</span>}
    </span>
  );
}
