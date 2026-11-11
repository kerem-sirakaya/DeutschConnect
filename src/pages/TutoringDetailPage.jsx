import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useTutoring } from '../state/TutoringContext.jsx';
import { getSchool, isHiddenSchool } from '../data/schools.js';
import { TUTOR_LIMITS, entryText, sortRequests, validateRequestMessage } from '../lib/tutoring.js';
import PageHeader from '../components/PageHeader.jsx';
import InfoList from '../components/InfoList.jsx';
import Icon from '../components/Icon.jsx';
import RequestCard from '../components/tutoring/RequestCard.jsx';
import TutoringStatusNotice from '../components/tutoring/TutoringStatusNotice.jsx';
import NotFoundPage from './NotFoundPage.jsx';

/**
 * Detail eines Nachhilfeeintrags.
 * - Fremder Eintrag: merken + echte Kontaktanfrage senden (geht an die erstellende Person).
 * - Eigener Eintrag: eingehende Anfragen beantworten, bearbeiten, schließen/öffnen, löschen.
 */
export default function TutoringDetailPage() {
  const { entryId } = useParams();
  const { t, language } = useI18n();
  const { status, entries, requests, actions, readOnly } = useTutoring();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const entry = entries.find((item) => item.id === entryId);

  if (!entry) {
    if (status === 'loading' || status === 'error' || status === 'notInstalled') {
      return (
        <div className="page">
          <PageHeader title={t('tutoring.title')} backTo="/tutoring" />
          <TutoringStatusNotice />
        </div>
      );
    }
    return <NotFoundPage titleKey="tutoring.notFound" backTo="/tutoring" />;
  }

  const school = getSchool(entry.schoolId);
  const incoming = sortRequests(requests.filter((r) => r.direction === 'incoming' && r.entryId === entry.id));
  const outgoing = requests.find((r) => r.direction === 'outgoing' && r.entryId === entry.id);

  const act = async (operation, after) => {
    if (busy || !actions) return false;
    setBusy(true);
    setErrorKey(null);
    const result = await operation();
    setBusy(false);
    if (result.errorKey) {
      setErrorKey(result.errorKey);
      return false;
    }
    after?.();
    return true;
  };

  return (
    <div className="page">
      <PageHeader title={`${entryText(entry, 'subject', language)} · ${entryText(entry, 'topics', language)}`} backTo="/tutoring" />
      <TutoringStatusNotice />
      {location.state?.saved && (
        <p className="notice notice--success" role="status">
          <Icon name="check" size={16} />
          {t('tutoring.savedNotice')}
        </p>
      )}

      <div className="details-layout">
        <article className="card stack">
          <div className="task-card__tags">
            <span className="badge badge--info">{t(`tutoring.kind.${entry.kind}`)}</span>
            {entry.status === 'closed' && <span className="badge badge--muted">{t('tutoring.closed')}</span>}
            {entry.isOwn && <span className="badge badge--neutral">{t('tutoring.own')}</span>}
          </div>
          <h2>{t('tutoring.fields.description')}</h2>
          <p className="pre-line">{entryText(entry, 'description', language)}</p>
          <InfoList
            items={[
              // ausgeblendete Schule (eigener Eintrag): keine Schulzeile – weder Name noch ID
              ...(isHiddenSchool(entry.schoolId) ? [] : [{ icon: 'school', label: t('tutoring.school'), value: school?.name ?? entry.schoolId }]),
              { icon: 'globe', label: t('tutoring.languagesLabel'), value: entry.languages.map((c) => t(`tutoring.languages.${c}`)).join(' · ') },
              { icon: 'mapPin', label: t('tutoring.formatLabel'), value: t(`tutoring.formats.${entry.format}`) },
              { icon: 'clock', label: t('tutoring.fields.availability'), value: entryText(entry, 'availability', language) },
            ]}
          />
          {!entry.isOwn && <p className="hint">{t('tutoring.anonymousHint')}</p>}
        </article>

        <aside className="stack">
          {errorKey && (
            <p className="notice notice--error" role="alert">
              <Icon name="info" size={16} />
              {t(errorKey)}
            </p>
          )}
          {entry.isOwn ? (
            <OwnerPanel
              entry={entry}
              busy={busy || readOnly}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              onToggle={() => act(() => actions.setEntryStatus(entry.id, entry.status === 'active' ? 'closed' : 'active'))}
              onDelete={() => act(() => actions.deleteEntry(entry.id), () => navigate('/tutoring?tab=my', { replace: true }))}
            />
          ) : (
            <ContactPanel
              entry={entry}
              outgoing={outgoing}
              busy={busy}
              readOnly={readOnly}
              onSave={() => act(() => actions.setSaved(entry.id, !entry.isSaved))}
              onSend={(message) => act(() => actions.sendRequest(entry.id, message))}
            />
          )}
        </aside>
      </div>

      {entry.isOwn && (
        <section className="stack" aria-labelledby="entry-requests">
          <h2 id="entry-requests">{t('tutoring.incoming')}</h2>
          {incoming.length ? (
            incoming.map((request) => <RequestCard key={request.id} request={request} showEntryLink={false} />)
          ) : (
            <p className="muted">{t('tutoring.noIncoming')}</p>
          )}
        </section>
      )}
    </div>
  );
}

function OwnerPanel({ entry, busy, confirmDelete, setConfirmDelete, onToggle, onDelete }) {
  const { t } = useI18n();
  return (
    <div className="card stack">
      <p className="muted">{t(entry.status === 'active' ? 'tutoring.ownActiveHint' : 'tutoring.ownClosedHint')}</p>
      <div className="form__actions">
        <Link to={`/tutoring/${entry.id}/edit`} className="btn btn--secondary btn--sm" aria-disabled={busy || undefined}>
          {t('tutoring.edit')}
        </Link>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onToggle}>
          {t(entry.status === 'active' ? 'tutoring.close' : 'tutoring.reopen')}
        </button>
      </div>
      {confirmDelete ? (
        <div className="stack">
          <p>{t('tutoring.deleteConfirm')}</p>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onDelete}>
              <Icon name="trash" size={16} />
              {t('tutoring.delete')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={16} />
          {t('tutoring.delete')}
        </button>
      )}
    </div>
  );
}

function ContactPanel({ entry, outgoing, busy, readOnly, onSave, onSend }) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const canRequest = !readOnly && entry.status === 'active' && (!outgoing || outgoing.status === 'withdrawn');

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateRequestMessage(message);
    setError(problem);
    if (problem) {
      e.currentTarget.querySelector('textarea')?.focus();
      return;
    }
    // Text erst leeren, wenn die Datenbank die Anfrage gespeichert hat
    if (await onSend(message)) setMessage('');
  };

  return (
    <div className="card stack">
      <button type="button" className="btn btn--secondary btn--sm" aria-pressed={entry.isSaved} disabled={busy || readOnly} onClick={onSave}>
        <Icon name="star" size={16} />
        {t(entry.isSaved ? 'tutoring.unsave' : 'tutoring.saveEntry')}
      </button>

      {outgoing && outgoing.status !== 'withdrawn' && <RequestCard request={outgoing} showEntryLink={false} />}

      {entry.status !== 'active' && !outgoing && <p className="muted">{t('tutoring.inactiveHint')}</p>}

      {canRequest && (
        <form className="stack" onSubmit={submit} noValidate>
          <h2>{t('tutoring.contactTitle')}</h2>
          <p className="field__hint">{t('tutoring.contactHint')}</p>
          <div className="field">
            <label htmlFor="tutor-message">{t('tutoring.messageLabel')}</label>
            <textarea
              id="tutor-message"
              rows={4}
              maxLength={TUTOR_LIMITS.message[1]}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'tutor-message-error' : undefined}
            />
            <div className="field__meta">
              {error && (
                <p id="tutor-message-error" className="field__error">
                  {t(error)}
                </p>
              )}
              <span className="field__counter">
                {message.length}/{TUTOR_LIMITS.message[1]}
              </span>
            </div>
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="mail" size={18} />
            {busy ? t('auth.loading') : t('tutoring.sendRequest')}
          </button>
        </form>
      )}
    </div>
  );
}
