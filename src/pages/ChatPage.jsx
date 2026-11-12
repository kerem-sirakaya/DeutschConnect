import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { supabase } from '../lib/supabaseClient.js';
import {
  TOPIC_SLUGS,
  chatTarget,
  inboxPreview,
  isStaffRole,
  isValidSearch,
  roomPreviewTime,
  roomTitle,
  sortByActivity,
} from '../lib/chat.js';
import {
  cancelRequest,
  joinRoom,
  leaveRoom,
  respondRequest,
  searchMessages,
  setBlock,
} from '../lib/chatApi.js';
import { useChatBlocks, useChatConversations, useChatInbox, useChatRooms, useChatStatus } from '../state/useChat.js';
import PageHeader from '../components/PageHeader.jsx';
import Tabs from '../components/Tabs.jsx';
import Icon from '../components/Icon.jsx';
import ReportForm from '../components/chat/ReportForm.jsx';
import RoomActionButtons from '../components/chat/RoomActionButtons.jsx';
import { ChatStateNotice, formatChatTime, useChatAction } from '../components/chat/chatUi.jsx';
import { useToast } from '../components/toast/ToastContext.jsx';
import { mentionsHiddenSchool } from '../lib/schoolVisibility.js';

/**
 * Chatroom (/chat): Gruppenräume · Private Chats · Nachrichtenanfragen · Suche.
 * Konzept der Themenräume nach Kerems Codex-Version; Daten + Rechte aus Migration 014.
 * Der Chat ist nur nutzbar, wenn er in der Datenbank eingeschaltet ist (chat_config.enabled).
 */
const TABS = ['rooms', 'private', 'requests', 'search'];

export default function ChatPage() {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'rooms';
  const status = useChatStatus();
  const inbox = useChatConversations();
  // Lesestand (020): Vorschau + „ungelesen“ je Raum/Gespräch; null = nicht verfügbar → wie bisher
  const readState = useChatInbox();
  const incoming = (inbox.requests.data ?? []).filter((r) => r.direction === 'incoming' && r.status === 'pending').length;

  const ready = status.status === 'ready';
  const role = status.data?.role ?? 'user';

  return (
    <div className="page">
      <PageHeader
        title={t('chat.title')}
        subtitle={t('chat.subtitle')}
        actions={
          ready && isStaffRole(role) ? (
            <Link to="/chat/moderation" className="btn btn--secondary btn--sm">
              <Icon name="shield" size={16} /> {t('chat.mod.title')}
            </Link>
          ) : null
        }
      />
      <ChatStateNotice result={status} />
      {ready && !status.data.enabled && isStaffRole(role) && (
        <p className="notice notice--demo">{t('chat.staffPreview')}</p>
      )}
      {ready && status.data.banEndsAt && (
        <p className="notice notice--error" role="alert">
          {t('chat.errors.banned', { until: formatChatTime(status.data.banEndsAt, language) })}
        </p>
      )}
      {ready && (
        <>
          <Tabs
            label={t('chat.tabsLabel')}
            active={tab}
            tabs={TABS.map((id) => ({ id, label: t(`chat.tabs.${id}`), count: id === 'requests' && incoming ? incoming : undefined }))}
          />
          {tab === 'rooms' && <RoomsTab readState={readState} />}
          {tab === 'private' && <PrivateTab inbox={inbox} readState={readState} />}
          {tab === 'requests' && <RequestsTab inbox={inbox} />}
          {tab === 'search' && <SearchTab />}
        </>
      )}
    </div>
  );
}

function RoomsTab({ readState }) {
  const { t, language } = useI18n();
  const rooms = useChatRooms({ live: true });
  const action = useChatAction();
  const toast = useToast();
  if (rooms.status !== 'ready') return <ChatStateNotice result={rooms} />;
  // Feste Reihenfolge der Themenräume (wie in Kerems Version), nicht alphabetisch
  const topics = rooms.data
    .filter((r) => r.kind === 'topic')
    .sort((a, b) => TOPIC_SLUGS.indexOf(a.slug) - TOPIC_SLUGS.indexOf(b.slug));
  // Gruppen mit der neuesten Nachricht zuerst (echter Zeitstempel aus der Datenbank)
  // Gruppen, deren Titel eine ausgeblendete Schule nennt (src/data/schools.js), nicht auflisten – nur Anzeige
  const groups = sortByActivity(
    rooms.data.filter((r) => r.kind !== 'topic' && !mentionsHiddenSchool(r.ideaTitle, r.eventTitle)),
  );

  async function toggle(room) {
    const leaving = room.isMember;
    if (await action.run(() => (leaving ? leaveRoom(supabase, room.id) : joinRoom(supabase, room.id)))) {
      toast.success(t(leaving ? 'toast.roomLeft' : 'toast.roomJoined'));
      rooms.reload();
    }
  }

  return (
    <div className="stack">
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
      <section className="stack" aria-labelledby="chat-topics">
        <h2 id="chat-topics">{t('chat.topicRooms')}</h2>
        <div className="chat-room-grid">
          {topics.map((room) => (
            <article key={room.id} className="card stack chat-room-card">
              <div className="chat-room-card__head">
                <span className="hub-card__icon" aria-hidden="true">
                  <Icon name="users" size={22} />
                </span>
                <div>
                  <h3>
                    {roomTitle(room, t, (v) => localize(v, language))}
                    <UnreadDot entry={readState?.get(chatTarget(room.id))} />
                  </h3>
                  <p className="muted">{t(`chat.rooms.${room.slug}.description`)}</p>
                </div>
              </div>
              <p className="muted chat-room-card__meta">
                {t('chat.memberCount', { count: room.memberCount })}
                {room.isMember && ` · ${t('chat.joined')}`}
                {room.archived && ` · ${t('chat.archived')}`}
              </p>
              <RoomActivity room={room} readState={readState} />
              <RoomActionButtons room={room} busy={action.busy} onToggle={() => toggle(room)} />
            </article>
          ))}
        </div>
      </section>
      <section className="stack" aria-labelledby="chat-groups">
        <h2 id="chat-groups">{t('chat.myGroups')}</h2>
        {groups.length ? (
          <ul className="card-list">
            {groups.map((room) => (
              <li key={room.id}>
                <Link to={`/chat/rooms/${room.id}`} className="card chat-list-item">
                  <span className="badge badge--info">{t(`chat.kind.${room.kind}`)}</span>
                  <span className="chat-list-item__title">
                    {roomTitle(room, t, (v) => localize(v, language))}
                    <UnreadDot entry={readState?.get(chatTarget(room.id))} />
                  </span>
                  {room.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
                  <RoomActivity room={room} readState={readState} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('chat.noGroups')}</p>
        )}
      </section>
    </div>
  );
}

/** Kleiner Punkt bei ungelesenen Nachrichten (nur aus chat_inbox_state, nie geraten). */
function UnreadDot({ entry }) {
  const { t } = useI18n();
  if (!entry?.hasUnread) return null;
  return <span className="chat-unread-dot" role="img" aria-label={t('chat.unread')} title={t('chat.unread')} />;
}

/** „Ben: Hallo …“ + Zeit – oder „Noch keine Nachrichten“. */
function InboxPreview({ entry }) {
  const { t, language } = useI18n();
  const preview = inboxPreview(entry, t('chat.you'));
  if (!preview) return <span className="muted chat-list-item__preview">{t('chat.noMessagesYet')}</span>;
  return (
    <span className="chat-preview">
      <span className="muted chat-preview__text">
        <span className="chat-preview__who">{preview.who}:</span> {preview.text}
      </span>
      <time className="muted chat-preview__time" dateTime={entry.lastMessageAt}>
        {formatChatTime(entry.lastMessageAt, language)}
      </time>
    </span>
  );
}

/**
 * Letzte Nachricht – nur für Mitglieder (chat_inbox_state liefert nur eigene Räume).
 * Ohne 020 (readState = null): wie bisher nur die Zeit der letzten Nachricht.
 */
function RoomActivity({ room, readState }) {
  const { t, language } = useI18n();
  if (!room.isMember) return null;
  const entry = readState?.get(chatTarget(room.id));
  if (entry) return <InboxPreview entry={entry} />;
  const at = roomPreviewTime(room);
  return (
    <span className="muted chat-list-item__preview">
      {at ? t('chat.lastMessage', { time: formatChatTime(at, language) }) : t('chat.noMessagesYet')}
    </span>
  );
}

function PrivateTab({ inbox, readState }) {
  const { t, language } = useI18n();
  const { conversations } = inbox;
  const blocks = useChatBlocks();
  const action = useChatAction();
  if (conversations.status !== 'ready') return <ChatStateNotice result={conversations} />;

  return (
    <div className="stack">
      <p className="muted">{t('chat.privateHint')}</p>
      {conversations.data.length ? (
        <ul className="card-list">
          {conversations.data.map((c) => {
            const entry = readState?.get(chatTarget(null, c.id));
            return (
              <li key={c.id}>
                <Link to={`/chat/conversations/${c.id}`} className="card chat-list-item">
                  <span className="chat-list-item__title">
                    {c.otherName}
                    <UnreadDot entry={entry} />
                  </span>
                  {c.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
                  {entry ? (
                    <InboxPreview entry={entry} />
                  ) : (
                    <>
                      <span className="muted chat-list-item__preview">
                        {c.lastBody ? `${c.lastIsOwn ? `${t('chat.you')}: ` : ''}${c.lastBody}` : t('chat.noMessagesYet')}
                      </span>
                      {c.lastMessageAt && <time className="muted">{formatChatTime(c.lastMessageAt, language)}</time>}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t('chat.noConversations')}</p>
      )}

      {blocks.status === 'ready' && blocks.data.length > 0 && (
        <section className="card stack" aria-labelledby="chat-blocked">
          <h2 id="chat-blocked">{t('chat.blockedTitle')}</h2>
          <p className="muted">{t('chat.blockedHint')}</p>
          {action.error && <p className="notice notice--error">{action.error}</p>}
          <ul className="compact-list">
            {blocks.data.map((b) => (
              <li key={b.userId} className="chat-blocked-row">
                <span>{b.firstName}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={action.busy}
                  onClick={async () => (await action.run(() => setBlock(supabase, b.userId, false))) && blocks.reload()}
                >
                  {t('chat.unblock')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RequestsTab({ inbox }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { requests, conversations } = inbox;
  const [reporting, setReporting] = useState(null);
  const action = useChatAction();
  if (requests.status !== 'ready') return <ChatStateNotice result={requests} />;
  const incoming = requests.data.filter((r) => r.direction === 'incoming');
  const outgoing = requests.data.filter((r) => r.direction === 'outgoing');

  async function respond(request, accept) {
    const result = await action.run(() => respondRequest(supabase, request.id, accept));
    if (result) {
      requests.reload();
      conversations.reload();
      if (accept && typeof result === 'string') navigate(`/chat/conversations/${result}`);
    }
  }

  async function block(request) {
    if (await action.run(() => setBlock(supabase, request.otherId, true))) requests.reload();
  }

  return (
    <div className="stack">
      <p className="muted">{t('chat.requestsHint')}</p>
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
      <section className="stack" aria-labelledby="chat-incoming">
        <h2 id="chat-incoming">{t('chat.incoming')}</h2>
        {incoming.length ? (
          incoming.map((r) => (
            <article key={r.id} className="card stack chat-request">
              <p className="chat-request__head">
                <strong>{r.otherName}</strong> <time className="muted">{formatChatTime(r.createdAt, language)}</time>
              </p>
              <p className="chat-request__intro">{r.intro}</p>
              <div className="chat-request__actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={action.busy} onClick={() => respond(r, true)}>
                  {t('chat.accept')}
                </button>
                <button type="button" className="btn btn--secondary btn--sm" disabled={action.busy} onClick={() => respond(r, false)}>
                  {t('chat.decline')}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReporting(reporting === r.id ? null : r.id)}>
                  {t('chat.reportAction')}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={action.busy} onClick={() => block(r)}>
                  {t('chat.block')}
                </button>
              </div>
              {reporting === r.id && (
                <ReportForm targetType="request" targetId={r.id} onCancel={() => setReporting(null)} />
              )}
            </article>
          ))
        ) : (
          <p className="muted">{t('chat.noIncoming')}</p>
        )}
      </section>
      <section className="stack" aria-labelledby="chat-outgoing">
        <h2 id="chat-outgoing">{t('chat.outgoing')}</h2>
        {outgoing.length ? (
          <ul className="card-list">
            {outgoing.map((r) => (
              <li key={r.id} className="card chat-request chat-request--outgoing">
                <span>
                  <strong>{r.otherName}</strong> · <span className="badge badge--neutral">{t(`chat.requestStatus.${r.status}`)}</span>
                </span>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={action.busy}
                    onClick={async () => (await action.run(() => cancelRequest(supabase, r.id))) && requests.reload()}
                  >
                    {t('chat.cancelRequest')}
                  </button>
                )}
                {r.status === 'accepted' && r.conversationId && (
                  <Link to={`/chat/conversations/${r.conversationId}`} className="btn btn--ghost btn--sm">
                    {t('chat.openConversation')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('chat.noOutgoing')}</p>
        )}
      </section>
    </div>
  );
}

function SearchTab() {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const action = useChatAction();

  async function submit(event) {
    event.preventDefault();
    if (!isValidSearch(query)) return;
    const found = await action.run(() => searchMessages(supabase, query.trim()));
    if (found) setResults(found);
  }

  return (
    <div className="stack">
      <form className="chat-search" onSubmit={submit} role="search">
        <label className="visually-hidden" htmlFor="chat-search-input">
          {t('chat.searchLabel')}
        </label>
        <input
          id="chat-search-input"
          type="search"
          value={query}
          maxLength={100}
          placeholder={t('chat.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!isValidSearch(query) || action.busy}>
          {t('chat.searchButton')}
        </button>
      </form>
      <p className="field__hint">{t('chat.searchHint')}</p>
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
      {results && (
        results.length ? (
          <ul className="card-list" aria-label={t('chat.searchResults')}>
            {results.map((r) => (
              <li key={r.messageId}>
                <Link
                  to={r.conversationId ? `/chat/conversations/${r.conversationId}` : `/chat/rooms/${r.roomId}`}
                  className="card chat-search-result"
                >
                  <span className="muted">
                    {r.conversationId
                      ? t('chat.searchInConversation', { name: r.otherName ?? '–' })
                      : roomTitle({ kind: r.roomKind, slug: r.roomSlug, ideaTitle: r.ideaTitle, eventTitle: r.eventTitle }, t, (v) =>
                          localize(v, language),
                        )}
                  </span>
                  <span>
                    <strong>{r.senderName}</strong> · <time className="muted">{formatChatTime(r.createdAt, language)}</time>
                  </span>
                  <span className="chat-search-result__body">{r.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" role="status">{t('chat.noResults')}</p>
        )
      )}
    </div>
  );
}
