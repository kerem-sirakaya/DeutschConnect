import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { TOAST_DURATION_MS, addToast, removeToast } from '../../lib/toastQueue.js';
import Icon from '../Icon.jsx';

/**
 * Kleine Erfolgsmeldungen („Toasts“) für die ganze App.
 *   const toast = useToast();  …  if (erfolgreich) toast.success(t('toast.roomJoined'));
 * Regeln: nur NACH bestätigtem Erfolg aufrufen. Fehler zeigen die Seiten weiterhin selbst an
 * (bestehende notice--error-Meldungen). Keine Browser-Dialoge, kein Fokus-Klau.
 */
const ToastContext = createContext({ success: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => removeToast(list, id)), []);
  const success = useCallback((message) => {
    if (!message) return;
    nextId.current += 1;
    setToasts((list) => addToast(list, { id: nextId.current, message }));
  }, []);
  const value = useMemo(() => ({ success }), [success]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Die Live-Region ist immer vorhanden – so lesen Screenreader neue Meldungen zuverlässig vor. */
function ToastRegion({ toasts, onDismiss }) {
  const { t } = useI18n();
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-label={t('toast.regionLabel')}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} closeLabel={t('toast.dismiss')} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss, closeLabel }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className="toast toast--success"
      onKeyDown={(event) => event.key === 'Escape' && onDismiss(toast.id)}
    >
      <Icon name="check" size={18} />
      <p className="toast__message">{toast.message}</p>
      <button type="button" className="toast__close" aria-label={closeLabel} onClick={() => onDismiss(toast.id)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
