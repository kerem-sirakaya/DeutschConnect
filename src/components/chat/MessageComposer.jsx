import { useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { MESSAGE_MAX, validateMessage } from '../../lib/chat.js';
import { useChatAction } from './chatUi.jsx';
import { useToast } from '../toast/ToastContext.jsx';

/**
 * Eingabefeld + Senden. send(body) → { censored }. Der Wortfilter läuft in der Datenbank;
 * war etwas zu zensieren, sieht die Absender:in einen Hinweis.
 */
export default function MessageComposer({ send, onSent, disabledText }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState(null);
  const [censored, setCensored] = useState(false);
  const action = useChatAction();
  const toast = useToast();

  if (disabledText) return <p className="notice notice--info chat-composer-disabled">{disabledText}</p>;

  async function submit(event) {
    event.preventDefault();
    const problem = validateMessage(body);
    setLocalError(problem);
    if (problem) return;
    const result = await action.run(() => send(body.trim()));
    if (result) {
      setBody('');
      setCensored(result.censored === true);
      // Erst nach der Bestätigung der Datenbank (bei Fehler ist result = false)
      toast.success(t('toast.messageSent'));
      onSent?.();
    }
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="chat-input">
        {t('chat.composerLabel')}
      </label>
      <textarea
        id="chat-input"
        rows={2}
        maxLength={MESSAGE_MAX}
        value={body}
        placeholder={t('chat.composerPlaceholder')}
        onChange={(event) => {
          setBody(event.target.value);
          setCensored(false);
        }}
        onKeyDown={(event) => {
          // Enter sendet, Umschalt+Enter macht eine neue Zeile
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form.requestSubmit();
          }
        }}
      />
      <button type="submit" className="btn btn--primary" disabled={action.busy || !body.trim()}>
        {t('chat.send')}
      </button>
      <div className="chat-composer__status" role="status">
        {localError && <p className="notice notice--error">{t(localError)}</p>}
        {action.error && <p className="notice notice--error">{action.error}</p>}
        {censored && <p className="chat-message__hint">{t('chat.censoredSent')}</p>}
        <p className="field__hint">{t('chat.composerHint')}</p>
      </div>
    </form>
  );
}
