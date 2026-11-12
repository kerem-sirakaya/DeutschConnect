import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { supabase } from '../lib/supabaseClient.js';
import { roomTitle } from '../lib/chat.js';
import { joinRoom, leaveRoom, sendRoomMessage } from '../lib/chatApi.js';
import { useChatRoom } from '../state/useChat.js';
import PageHeader from '../components/PageHeader.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageComposer from '../components/chat/MessageComposer.jsx';
import ReportForm from '../components/chat/ReportForm.jsx';
import RoomActionButtons from '../components/chat/RoomActionButtons.jsx';
import { ChatStateNotice, formatChatTime, useChatAction } from '../components/chat/chatUi.jsx';
import { useToast } from '../components/toast/ToastContext.jsx';

/**
 * Gruppenraum (/chat/rooms/:roomId) – „Raum betreten“: Themenraum, Projekt- oder Eventgruppe.
 *   * Kein Mitglied: nur Name, Beschreibung und „Beitreten“ – KEINE Nachrichten. Ob gelesen werden darf,
 *     entscheidet die Datenbank (chat_room_messages -> DC042); Moderation darf mitlesen.
 *   * Mitglied: Verlauf (Name, Profilbild-Kürzel, Zeit), Eingabe + „Senden“, neue Nachrichten live
 *     (Supabase Realtime, Sicherheitsnetz: regelmäßiges Neuladen – useChatRoom).
 *   * Verlassen: zurück zur Übersicht; danach liefert die Datenbank keine Nachrichten mehr.
 */
export default function ChatRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { detail, messages, members, live, markDisplayed } = useChatRoom(roomId);
  const [reporting, setReporting] = useState(false);
  const action = useChatAction();
  const toast = useToast();

  if (detail.status !== 'ready' || !detail.data) {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('chat.roomTitle')} backTo="/chat" />
        {detail.status === 'ready' ? <p className="muted">{t('chat.errors.notFound')}</p> : <ChatStateNotice result={detail} />}
      </div>
    );
  }

  const room = detail.data;
  const title = roomTitle(room, t, (v) => localize(v, language));
  const description = room.kind === 'topic' ? t(`chat.rooms.${room.slug}.description`) : t(`chat.kind.${room.kind}`);
  const reloadAll = () => {
    detail.reload();
    messages.reload();
    members.reload();
  };

  async function toggleMembership() {
    const leaving = room.isMember;
    const ok = await action.run(() => (leaving ? leaveRoom(supabase, roomId) : joinRoom(supabase, roomId)));
    if (!ok) return;
    // Erst NACH der Bestätigung durch die Datenbank melden (ok = true)
    toast.success(t(leaving ? 'toast.roomLeft' : 'toast.roomJoined'));
    if (leaving) navigate('/chat');
    else reloadAll();
  }

  // Datenbank verweigert das Lesen -> kein Zutritt (nur Beitreten anbieten)
  const locked = messages.status === 'error' && messages.errorKey === 'chat.errors.noAccess';

  let disabledText = null;
  if (room.archived) disabledText = t('chat.archivedHint');
  else if (room.banEndsAt) {
    const key = room.banScope === 'room' ? 'chat.errors.bannedRoom' : 'chat.errors.banned';
    disabledText = t(key, { until: formatChatTime(room.banEndsAt, language) });
  }
  else if (!room.isMember) disabledText = t('chat.joinToWrite');
  else if (!room.canWrite) disabledText = t('chat.readOnly');

  return (
    <div className="page page--narrow chat-page">
      <PageHeader title={title} subtitle={description} backTo="/chat" />
      <div className="chat-room-bar">
        <p className="chat-context">
          <span className="badge badge--info">{t(`chat.kind.${room.kind}`)}</span>
          {room.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
          {!locked && room.isMember && (
            <span className={`chat-live${live ? ' chat-live--on' : ''}`}>{live ? t('chat.liveOn') : t('chat.liveOff')}</span>
          )}
        </p>
        <RoomActionButtons room={room} busy={action.busy} onToggle={toggleMembership} showEnter={false} />
      </div>
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}

      {locked ? (
        <section className="card stack chat-locked" aria-labelledby="chat-locked-title">
          <h2 id="chat-locked-title">{t('chat.lockedTitle')}</h2>
          <p className="muted">{room.kind === 'topic' ? t('chat.joinToRead') : t('chat.lockedGroupHint')}</p>
        </section>
      ) : messages.status === 'ready' ? (
        <>
          <p className="muted chat-room-hint">{t('chat.groupHint')}</p>
          <section className="card chat-thread" aria-label={title}>
            <MessageList
              messages={messages.data}
              canInteract={room.canWrite}
              onChanged={messages.reload}
              emptyText={t('chat.emptyRoom')}
              onDisplayed={markDisplayed}
            />
            <MessageComposer
              send={(body) => sendRoomMessage(supabase, roomId, body)}
              onSent={messages.reload}
              disabledText={disabledText}
            />
          </section>
        </>
      ) : (
        <ChatStateNotice result={messages} />
      )}

      {!locked && members.status === 'ready' && members.data.length > 0 && (
        <details className="disclosure">
          <summary>{t('chat.members', { count: members.data.length })}</summary>
          <ul className="chat-members">
            {members.data.map((m) => (
              <li key={m.userId}>{m.isSelf ? `${m.firstName} (${t('chat.you')})` : m.firstName}</li>
            ))}
          </ul>
        </details>
      )}

      {room.isMember && (
        <div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReporting(!reporting)}>
            {t('chat.reportRoom')}
          </button>
          {reporting && <ReportForm targetType="room" targetId={roomId} onCancel={() => setReporting(false)} />}
        </div>
      )}
    </div>
  );
}
