import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { createProjectRoom } from '../../lib/chatApi.js';
import { canCreateProjectGroup, isApprovalRejection } from '../../lib/groupApproval.js';
import { useChatRooms } from '../../state/useChat.js';
import { useChatAction } from './chatUi.jsx';
import GroupApprovalNotice from './GroupApprovalNotice.jsx';

/**
 * Projektgruppe im Chat (Migration 014) für Autor:in und Mitglieder eines Projekts.
 * Gibt es die Gruppe: „Projektgruppe öffnen“. Sonst darf nur die Autor:in sie anlegen –
 * und erst, wenn ein Admin die Idee freigegeben hat (Status collecting/review/planned).
 * Der Hinweis dazu erscheint NUR nach einem Erstellungsversuch, nicht dauerhaft.
 * Die Datenbank prüft die Freigabe zusätzlich selbst (chat_create_project_room).
 * Ist der Chat aus oder nicht eingerichtet, erscheint nichts.
 */
export default function ProjectChatLink({ ideaId, ideaStatus, isOwner }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const rooms = useChatRooms();
  const action = useChatAction();
  const [notApproved, setNotApproved] = useState(false);
  if (rooms.status !== 'ready') return null;
  const room = rooms.data.find((r) => r.kind === 'project' && r.ideaId === ideaId);

  if (room) {
    return (
      <Link to={`/chat/rooms/${room.id}`} className="btn btn--secondary btn--sm">
        {t('chat.openProjectGroup')}
      </Link>
    );
  }
  if (!isOwner) return null;
  // Hinweis: nach Klick bei fehlender Freigabe ODER wenn der Server aus diesem Grund ablehnt
  const showApproval = notApproved || isApprovalRejection('project', action.raw);
  return (
    <div className="stack">
      <div>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={action.busy}
          onClick={async () => {
            if (!canCreateProjectGroup(ideaStatus)) {
              action.clear();
              setNotApproved(true);
              return;
            }
            setNotApproved(false);
            const id = await action.run(() => createProjectRoom(supabase, ideaId));
            if (typeof id === 'string') navigate(`/chat/rooms/${id}`);
          }}
        >
          {t('chat.createProjectGroup')}
        </button>
      </div>
      {showApproval ? (
        <GroupApprovalNotice />
      ) : (
        action.error && <p className="notice notice--error">{action.error}</p>
      )}
    </div>
  );
}
