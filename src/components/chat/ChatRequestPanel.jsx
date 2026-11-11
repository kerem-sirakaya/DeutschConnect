import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { INTRO_MAX, chatError, validateMessage } from '../../lib/chat.js';
import { sendRequest } from '../../lib/chatApi.js';
import { useChatStatus } from '../../state/useChat.js';
import { useChatAction } from './chatUi.jsx';

/**
 * „Nachricht senden“ auf einem öffentlichen Profil → NACHRICHTENANFRAGE (kein Gespräch).
 * Erst wenn die andere Person annimmt, entsteht ein privater Chat (Migration 014).
 * Nicht auf dem eigenen Profil, nicht ohne Anmeldung, nicht wenn der Chat aus ist.
 * startOpen: Formular sofort zeigen (z. B. nach dem Klick auf „Nachricht senden“ bei angenommener Nachhilfe).
 */
export default function ChatRequestPanel({ person, startOpen = false }) {
  const { t } = useI18n();
  const status = useChatStatus();
  const [open, setOpen] = useState(startOpen);
  const [intro, setIntro] = useState('');
  const [result, setResult] = useState(null); // { censored }
  const [localError, setLocalError] = useState(null);
  const action = useChatAction();

  if (person.isSelf || status.status !== 'ready' || !status.data.enabled) return null;

  const existing = action.raw?.code === 'DC048' ? chatError(action.raw).conversationId : null;

  if (result) {
    return (
      <p className="notice notice--success" role="status">
        {t('chat.requestSent', { name: person.firstName })}
        {result.censored && ` ${t('chat.censoredSent')}`}
      </p>
    );
  }

  async function submit(event) {
    event.preventDefault();
    const problem = validateMessage(intro, INTRO_MAX);
    setLocalError(problem);
    if (problem) return;
    const sent = await action.run(() => sendRequest(supabase, person.id, intro.trim()));
    if (sent) setResult(sent);
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
          {t('chat.sendMessage')}
        </button>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="chat-request-title">
      <h2 id="chat-request-title">{t('chat.requestTitle', { name: person.firstName })}</h2>
      <p className="muted">{t('chat.requestExplain')}</p>
      <div className="field">
        <label>
          {t('chat.requestIntro')}
          <textarea rows={3} maxLength={INTRO_MAX} value={intro} onChange={(event) => setIntro(event.target.value)} />
        </label>
        <span className="field__hint">{t('chat.composerHint')}</span>
      </div>
      {localError && <p className="notice notice--error">{t(localError)}</p>}
      {action.error && (
        <p className="notice notice--error" role="alert">
          {action.error}{' '}
          {existing && (
            <Link to={`/chat/conversations/${existing}`} className="text-link">
              {t('chat.openConversation')}
            </Link>
          )}
          {action.raw?.code === 'DC046' && action.raw?.hint !== 'outgoing' && (
            <Link to="/chat?tab=requests" className="text-link">
              {t('chat.tabs.requests')}
            </Link>
          )}
        </p>
      )}
      <div className="confirm__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={action.busy}>
          {t('chat.sendRequest')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
