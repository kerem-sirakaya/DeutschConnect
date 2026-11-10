import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { chatError } from '../../lib/chat.js';

/** Datum + Uhrzeit kurz, z. B. „09.11., 14:30“. */
export function formatChatTime(value, language) {
  if (!value) return '';
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

/** Fehler (aus der Datenbank) → verständlicher Satz in der aktuellen Sprache. */
export function useChatErrorText() {
  const { t, language } = useI18n();
  return (error) => {
    const info = typeof error === 'string' ? { key: error } : chatError(error);
    return t(info.key, { until: info.until ? formatChatTime(info.until, language) : '' });
  };
}

/**
 * Führt eine Aktion aus und merkt sich Fehler/Erfolg.
 * run(fn) → bei Erfolg der Rückgabewert der Aktion – oder true, wenn dieser „leer“ ist
 * (null, '', false: z. B. Funktionen ohne Rückgabe oder „Reaktion entfernt“ = false).
 * Bei Fehler: false. error: angezeigter Text oder null.
 */
export function useChatAction() {
  const errorText = useChatErrorText();
  const [state, setState] = useState({ busy: false, error: null, raw: null });
  async function run(fn) {
    setState({ busy: true, error: null, raw: null });
    try {
      const result = await fn();
      setState({ busy: false, error: null, raw: null });
      return result === null || result === undefined || result === '' || result === false ? true : result;
    } catch (error) {
      setState({ busy: false, error: errorText(error), raw: error });
      return false;
    }
  }
  return { ...state, run, clear: () => setState({ busy: false, error: null, raw: null }) };
}

/**
 * Gemeinsame Zustände für Chat-Seiten: abgemeldet, lädt, Migration fehlt, Chat aus, Fehler.
 * Gibt null zurück, wenn alles bereit ist.
 */
export function ChatStateNotice({ result }) {
  const { t } = useI18n();
  if (result.status === 'demo') {
    return (
      <div className="card stack">
        <p>{t('chat.loginHint')}</p>
        <div>
          <Link to="/login" className="btn btn--secondary">
            {t('chat.login')}
          </Link>
        </div>
      </div>
    );
  }
  if (result.status === 'loading') return <p className="muted">{t('chat.loading')}</p>;
  if (result.status === 'notInstalled') return <p className="notice notice--info">{t('chat.errors.notInstalled')}</p>;
  if (result.status === 'error') {
    if (result.errorKey === 'chat.errors.disabled') {
      return <p className="notice notice--info">{t('chat.errors.disabled')}</p>;
    }
    return (
      <div className="stack">
        <p className="notice notice--error" role="alert">
          {t(result.errorKey ?? 'chat.errors.generic')}
        </p>
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={result.reload}>
            {t('chat.retry')}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/** Bestätigung mit Pflicht-Begründung (für Moderations-Aktionen). */
export function ReasonConfirm({ label, confirmLabel, onConfirm, onCancel, busy, danger = true }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <div className="confirm" role="group" aria-label={label}>
      <p>{label}</p>
      <div className="field">
        <label>
          {t('chat.mod.reason')}
          <input type="text" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </label>
        <span className="field__hint">{t('chat.mod.reasonHint')}</span>
      </div>
      <div className="confirm__actions">
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'} btn--sm`}
          disabled={!valid || busy}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
