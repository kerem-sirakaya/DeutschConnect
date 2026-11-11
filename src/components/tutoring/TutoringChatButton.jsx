import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { directMessageStep } from '../../lib/chat.js';
import { fetchConversations, fetchRequests } from '../../lib/chatApi.js';
import { fetchPublicProfile } from '../../lib/profilesApi.js';
import { useChatStatus } from '../../state/useChat.js';
import { useChatAction } from '../chat/chatUi.jsx';
import ChatRequestPanel from '../chat/ChatRequestPanel.jsx';

/**
 * „Nachricht senden“ bei einer ANGENOMMENEN Nachhilfe-Anfrage – für beide Beteiligten.
 * Nutzt das bestehende Chat-System (Migration 014), kein eigenes Nachrichtensystem:
 *   – Gespräch besteht schon → direkt öffnen (keine doppelte Anfrage)
 *   – offene Nachrichtenanfrage → Hinweis (bzw. Link zu den eigenen Nachrichtenanfragen)
 *   – sonst Nachrichtenanfrage über ChatRequestPanel (chat_send_request)
 * Erreichbar ist nur, wer ein öffentliches Profil hat (Regel von chat_send_request) – sonst ein Hinweis.
 * Geprüft wird erst beim Klick, damit eine Liste mit vielen Anfragen nicht viele Abfragen auslöst.
 * Nicht sichtbar: Demo-Modus, Chat ausgeschaltet, Anfrage nicht angenommen, ID der anderen Person fehlt.
 */
export default function TutoringChatButton({ request }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const status = useChatStatus();
  const check = useChatAction();
  const [step, setStep] = useState(null);
  const otherId = request.otherProfileId;
  const name = request.otherFirstName ?? '';

  if (request.status !== 'accepted' || !otherId || !supabase) return null;
  if (status.status !== 'ready' || !status.data?.enabled) return null;

  async function start() {
    const next = await check.run(async () => {
      const [conversations, requests, profile] = await Promise.all([
        fetchConversations(supabase),
        fetchRequests(supabase),
        fetchPublicProfile(supabase, otherId),
      ]);
      return directMessageStep(otherId, { conversations, requests, reachable: profile?.isPublic === true });
    });
    if (!next) return;
    if (next.step === 'open') navigate(`/chat/conversations/${next.conversationId}`);
    else setStep(next.step);
  }

  if (step === 'request') {
    return <ChatRequestPanel person={{ id: otherId, firstName: name }} startOpen />;
  }
  if (step === 'pendingOutgoing') {
    return (
      <p className="notice" role="status">
        {t('chat.errors.requestPendingOutgoing')}
      </p>
    );
  }
  if (step === 'pendingIncoming') {
    return (
      <p className="notice" role="status">
        {t('chat.errors.requestPendingIncoming')}{' '}
        <Link to="/chat?tab=requests" className="text-link">
          {t('chat.tabs.requests')}
        </Link>
      </p>
    );
  }
  if (step === 'unreachable') {
    return (
      <p className="notice" role="status">
        {t('tutoring.chatUnreachable', { name })}
      </p>
    );
  }

  return (
    <div className="stack">
      <div>
        <button type="button" className="btn btn--primary btn--sm" onClick={start} disabled={check.busy}>
          {check.busy ? t('auth.loading') : t('chat.sendMessage')}
        </button>
      </div>
      {check.error && (
        <p className="notice notice--error" role="alert">
          {check.error}
        </p>
      )}
    </div>
  );
}
