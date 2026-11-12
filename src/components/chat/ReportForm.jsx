import { useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { REPORT_CATEGORIES } from '../../lib/chat.js';
import { report } from '../../lib/chatApi.js';
import { useChatAction } from './chatUi.jsx';

/**
 * Melden (Nachricht, Person, Raum, Gespräch, Anfrage). Meldungen sehen nur Moderator:innen/Admins;
 * die gemeldete Person erfährt nicht, wer gemeldet hat.
 */
export default function ReportForm({ targetType, targetId, onDone, onCancel }) {
  const { t } = useI18n();
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const action = useChatAction();

  if (sent) {
    return (
      <p className="notice notice--success" role="status">
        {t('chat.report.sent')}
      </p>
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!category) return;
    if (await action.run(() => report(supabase, targetType, targetId, category, note.trim()))) {
      setSent(true);
      onDone?.();
    }
  }

  return (
    <form className="chat-report card stack" onSubmit={submit}>
      <p className="chat-report__title">{t(`chat.report.title.${targetType}`)}</p>
      <div className="field">
        <label>
          {t('chat.report.category')}
          <select value={category} onChange={(event) => setCategory(event.target.value)} required>
            <option value="">{t('chat.report.choose')}</option>
            {REPORT_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {t(`chat.report.categories.${id}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <label>
          {t('chat.report.note')}
          <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <span className="field__hint">{t('chat.report.noteHint')}</span>
      </div>
      {action.error && (
        <p className="notice notice--error" role="alert">
          {action.error}
        </p>
      )}
      <div className="confirm__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={!category || action.busy}>
          {t('chat.report.submit')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
