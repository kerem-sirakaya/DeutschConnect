import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { roomTitle } from '../lib/chat.js';
import { communityGroups, normalizeGroupFilter } from '../lib/communityGroups.js';
import { useChatRooms, useChatStatus } from '../state/useChat.js';
import PageHeader from '../components/PageHeader.jsx';
import FilterChips from '../components/FilterChips.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { ChatStateNotice, formatChatTime } from '../components/chat/chatUi.jsx';

/**
 * Community → Projekt- und Eventgruppen (/community/groups).
 *
 * Nutzt die bestehende Chat-Struktur (Migration 014) – keine neue Tabelle, keine neuen Daten:
 * - Projektgruppe = Chat-Raum zu einer veröffentlichten Idee (Mitglieder aus Migration 013)
 * - Eventgruppe   = Chat-Raum zu einem Event (Mitglieder = verbindlich Angemeldete)
 * Beiträge und Diskussionen sind die Nachrichten im jeweiligen Raum (/chat/rooms/:id).
 * Ohne Anmeldung oder bei ausgeschaltetem Chat erscheint derselbe Hinweis wie im Chatroom.
 */
export default function CommunityGroupsPage() {
  const { t } = useI18n();
  const status = useChatStatus();

  return (
    <div className="page">
      <PageHeader title={t('community.groups.title')} subtitle={t('community.groups.subtitle')} backTo="/community" />
      <ChatStateNotice result={status} />
      {status.status === 'ready' && <GroupList />}
    </div>
  );
}

function GroupList() {
  const { t, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const filter = normalizeGroupFilter(params.get('kind'));
  const rooms = useChatRooms({ live: true });

  const setFilter = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('kind');
    else next.set('kind', value);
    setParams(next, { replace: true });
  };

  if (rooms.status !== 'ready') return <ChatStateNotice result={rooms} />;
  const groups = communityGroups(rooms.data, filter);

  return (
    <div className="stack">
      <FilterChips
        label={t('community.groups.filterLabel')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('community.groups.filter.all') },
          { value: 'project', label: t('community.groups.filter.project') },
          { value: 'event', label: t('community.groups.filter.event') },
        ]}
      />

      {groups.length > 0 ? (
        <ul className="card-list">
          {groups.map((room) => (
            <li key={room.id}>
              <Link to={`/chat/rooms/${room.id}`} className="card chat-list-item">
                <span className="badge badge--info">{t(`chat.kind.${room.kind}`)}</span>
                <span className="chat-list-item__title">{roomTitle(room, t, (v) => localize(v, language))}</span>
                {room.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
                <span className="muted small chat-list-item__preview">
                  {t('chat.memberCount', { count: room.memberCount })}
                  {room.lastMessageAt
                    ? ` · ${t('community.groups.lastPost', { time: formatChatTime(room.lastMessageAt, language) })}`
                    : ` · ${t('community.groups.noPosts')}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="users" title={t(`community.groups.empty.${filter}`)} text={t('community.groups.emptyHint')} />
      )}

      <section className="card info-card" aria-labelledby="groups-how">
        <h2 id="groups-how" className="info-card__title">
          <Icon name="info" size={18} />
          {t('community.groups.howTitle')}
        </h2>
        <ul className="stack muted small">
          <li>{t('community.groups.howProject')}</li>
          <li>{t('community.groups.howEvent')}</li>
        </ul>
      </section>
    </div>
  );
}
