import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { getSchool } from '../../data/schools.js';
import { useTutoring } from '../../state/TutoringContext.jsx';
import { TUTOR_LIMITS, validateResponseNote } from '../../lib/tutoring.js';
import { formatDateShort } from '../../lib/format.js';
import Icon from '../Icon.jsx';

const TONES = { pending: 'warning', accepted: 'success', declined: 'danger', withdrawn: 'muted' };

/**
 * Eine Kontaktanfrage – eingehend (ich habe den Eintrag erstellt: annehmen/ablehnen)
 * oder ausgehend (ich habe angefragt: zurückziehen).
 */
export default function RequestCard({ request, showEntryLink = true }) {
  const { t, locale } = useI18n();
  const { actions } = useTutoring();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const incoming = request.direction === 'incoming';
  const school = getSchool(request.otherSchoolId);
  const who = request.otherFirstName
    ? `${request.otherFirstName} · ${school?.shortName ?? ''}`
    : t('tutoring.someoneFrom', { school: school?.shortName ?? '–' });

  const act = async (operation) => {
    if (busy || !actions) return;
    setBusy(true);
    setErrorKey(null);
    const result = await operation();
    setBusy(false);
    if (result.errorKey) setErrorKey(result.errorKey);
  };

  const respond = (accept) => {
    const problem = validateResponseNote(note);
    if (problem) {
      setErrorKey(problem);
      return;
    }
    act(() => actions.respond(request.id, accept, note));
  };

  return (
    <article className="card request-card" aria-busy={busy}>
      <div className="request-card__head">
        <span className={`badge badge--${TONES[request.status] ?? 'neutral'}`}>
          {t(`tutoring.requestStatus.${request.status}`)}
        </span>
        <span className="muted request-card__date">{formatDateShort(request.createdAt, locale)}</span>
      </div>
      <p className="request-card__who">
        <Icon name={incoming ? 'mail' : 'arrowRight'} size={15} />
        {incoming ? t('tutoring.fromPerson', { name: who }) : t('tutoring.toPerson', { name: who })}
      </p>
      {request.otherProfileId && (
        // Das Profil zeigt nur, was die Person freigegeben hat (sonst "nicht verfügbar").
        <Link to={`/community/people/${request.otherProfileId}`} className="text-link">
          {t('profiles.openProfile')}
        </Link>
      )}
      {showEntryLink && (
        <Link to={`/tutoring/${request.entryId}`} className="text-link">
          {t(`tutoring.kind.${request.entryKind}`)}: {request.entrySubject} · {request.entryTopics}
        </Link>
      )}
      <p className="pre-line request-card__message">{request.message}</p>
      {request.responseNote && (
        <p className="request-card__note">
          <strong>{t('tutoring.responseNote')}:</strong> {request.responseNote}
        </p>
      )}
      {request.status === 'accepted' && <p className="hint">{t('tutoring.acceptedHint')}</p>}

      {incoming && request.status === 'pending' && (
        <div className="stack">
          <div className="field">
            <label htmlFor={`note-${request.id}`}>{t('tutoring.responseNoteLabel')}</label>
            <textarea
              id={`note-${request.id}`}
              rows={2}
              maxLength={TUTOR_LIMITS.note[1]}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => respond(false)}>
              {t('tutoring.decline')}
            </button>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond(true)}>
              <Icon name="check" size={16} />
              {t('tutoring.accept')}
            </button>
          </div>
        </div>
      )}
      {!incoming && ['pending', 'accepted'].includes(request.status) && (
        <div className="form__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act(() => actions.withdraw(request.id))}>
            {t('tutoring.withdrawRequest')}
          </button>
        </div>
      )}
      {errorKey && (
        <p className="field__error" role="alert">
          {t(errorKey)}
        </p>
      )}
    </article>
  );
}
