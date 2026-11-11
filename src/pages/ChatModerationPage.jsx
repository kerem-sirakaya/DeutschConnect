import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { supabase } from '../lib/supabaseClient.js';
import { BAN_DURATIONS, chatErrorKey, isStaffRole, maxBanMinutes, roomTitle } from '../lib/chat.js';
import * as api from '../lib/chatApi.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { useRemote } from '../state/useRemote.js';
import { useChatStatus } from '../state/useChat.js';
import PageHeader from '../components/PageHeader.jsx';
import Tabs from '../components/Tabs.jsx';
import { ChatStateNotice, ReasonConfirm, formatChatTime, useChatAction } from '../components/chat/chatUi.jsx';
import GroupApprovalNotice from '../components/chat/GroupApprovalNotice.jsx';
import { canCreateEventGroup, isApprovalRejection } from '../lib/groupApproval.js';

/**
 * Chat-Moderation (/chat/moderation) – nur für Moderator:innen und Admins.
 * Die Anzeige ist Komfort; JEDE Aktion prüft die Datenbank (chat_require_staff / chat_require_admin)
 * und schreibt sie ins Audit-Protokoll. Private Nachrichten sind hier NICHT allgemein lesbar –
 * nur gemeldete Inhalte und (protokolliert, mit Begründung) deren Zusammenhang.
 */
const STAFF_TABS = ['reports', 'bans', 'rooms', 'audit'];
const ADMIN_TABS = ['reports', 'bans', 'rooms', 'conversations', 'audit', 'settings'];

const useLoad = (load, deps) => useRemote(load, () => null, deps, chatErrorKey);

export default function ChatModerationPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const status = useChatStatus();
  const role = status.data?.role ?? 'user';
  const tabs = role === 'admin' ? ADMIN_TABS : STAFF_TABS;
  const tab = tabs.includes(params.get('tab')) ? params.get('tab') : 'reports';

  if (status.status !== 'ready' || !isStaffRole(role)) {
    return (
      <div className="page">
        <PageHeader title={t('chat.mod.title')} backTo="/chat" />
        {status.status === 'ready' ? <p className="notice notice--error">{t('chat.errors.notAllowed')}</p> : <ChatStateNotice result={status} />}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t('chat.mod.title')} subtitle={t(`chat.mod.roleHint.${role}`)} backTo="/chat" />
      <p>
        <span className="badge badge--warning">{t(`chat.mod.role.${role}`)}</span>
      </p>
      <Tabs label={t('chat.mod.tabsLabel')} active={tab} tabs={tabs.map((id) => ({ id, label: t(`chat.mod.tabs.${id}`) }))} />
      {tab === 'reports' && <ReportsTab role={role} />}
      {tab === 'bans' && <BansTab role={role} />}
      {tab === 'rooms' && <RoomsTab role={role} />}
      {tab === 'conversations' && role === 'admin' && <ConversationsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && role === 'admin' && <SettingsTab />}
    </div>
  );
}

// ---------- Meldungen ----------
function ReportsTab({ role }) {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState('open');
  const reports = useLoad((client) => api.modListReports(client, filter), [filter]);

  return (
    <section className="stack">
      <div className="chip-group">
        {['open', 'resolved', 'dismissed'].map((id) => (
          <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {t(`chat.mod.reportStatus.${id}`)}
          </button>
        ))}
      </div>
      {reports.status !== 'ready' ? (
        <ChatStateNotice result={reports} />
      ) : reports.data.length === 0 ? (
        <p className="muted">{t('chat.mod.noReports')}</p>
      ) : (
        reports.data.map((r) => <ReportCard key={r.id} report={r} role={role} language={language} onChanged={reports.reload} />)
      )}
    </section>
  );
}

function ReportCard({ report, role, language, onChanged }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState(null); // context | delete | resolve | dismiss | ban
  const [context, setContext] = useState(null);
  const action = useChatAction();
  const done = async (fn) => {
    if (await action.run(fn)) {
      setPanel(null);
      onChanged();
    }
  };

  return (
    <article className="card stack chat-mod-card">
      <p className="chat-mod-card__head">
        <span className="badge badge--danger">{t(`chat.report.categories.${report.category}`)}</span>
        <span className="badge badge--neutral">{t(`chat.mod.target.${report.target_type}`)}</span>
        <time className="muted">{formatChatTime(report.created_at, language)}</time>
      </p>
      <p className="muted">
        {t('chat.mod.reportedBy', { name: report.reporter_name ?? '–' })}
        {report.target_user_name && ` · ${t('chat.mod.concerns', { name: report.target_user_name })}`}
      </p>
      {report.evidence && <blockquote className="chat-evidence">{report.evidence}</blockquote>}
      {report.note && <p>{t('chat.mod.note')}: {report.note}</p>}
      {report.status !== 'open' && <p className="muted">{t('chat.mod.resolution')}: {report.resolution}</p>}

      {report.status === 'open' && (
        <div className="chat-request__actions">
          {report.message_id && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel('context')}>
              {t('chat.mod.viewContext')}
            </button>
          )}
          {report.message_id && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel('delete')}>
              {t('chat.mod.deleteMessage')}
            </button>
          )}
          {report.target_user_id && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel('ban')}>
              {t('chat.mod.banUser')}
            </button>
          )}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPanel('resolve')}>
            {t('chat.mod.resolve')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel('dismiss')}>
            {t('chat.mod.dismiss')}
          </button>
        </div>
      )}

      {panel === 'context' && (
        <ReasonConfirm
          label={report.conversation_id ? t('chat.mod.contextPrivateWarning') : t('chat.mod.contextRoom')}
          confirmLabel={t('chat.mod.viewContext')}
          danger={false}
          busy={action.busy}
          onCancel={() => setPanel(null)}
          onConfirm={async (reason) => {
            const rows = await action.run(() => api.modReportContext(supabase, report.id, reason));
            if (rows) {
              setContext(rows);
              setPanel(null);
            }
          }}
        />
      )}
      {context && (
        <ol className="chat-context-list">
          {context.map((m) => (
            <li key={m.id} className={m.is_reported ? 'chat-context-list__reported' : ''}>
              <strong>{m.sender_name}</strong> <time className="muted">{formatChatTime(m.created_at, language)}</time>
              <p>{m.deleted ? t('chat.deletedMessage') : m.body}</p>
            </li>
          ))}
        </ol>
      )}
      {panel === 'delete' && (
        <ReasonConfirm
          label={t('chat.mod.deleteMessageConfirm')}
          confirmLabel={t('chat.mod.deleteMessage')}
          busy={action.busy}
          onCancel={() => setPanel(null)}
          onConfirm={(reason) => done(() => api.modDeleteMessage(supabase, report.message_id, reason))}
        />
      )}
      {(panel === 'resolve' || panel === 'dismiss') && (
        <ReasonConfirm
          label={t(panel === 'resolve' ? 'chat.mod.resolveConfirm' : 'chat.mod.dismissConfirm')}
          confirmLabel={t(panel === 'resolve' ? 'chat.mod.resolve' : 'chat.mod.dismiss')}
          danger={false}
          busy={action.busy}
          onCancel={() => setPanel(null)}
          onConfirm={(reason) =>
            done(() => api.modResolveReport(supabase, report.id, panel === 'resolve' ? 'resolved' : 'dismissed', reason))
          }
        />
      )}
      {panel === 'ban' && (
        <BanForm
          role={role}
          user={{ id: report.target_user_id, name: report.target_user_name }}
          roomId={report.room_id}
          onDone={() => setPanel(null)}
          onCancel={() => setPanel(null)}
        />
      )}
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
    </article>
  );
}

// ---------- Sperren ----------
function BanForm({ role, user, roomId, onDone, onCancel }) {
  const { t, language } = useI18n();
  const [target, setTarget] = useState(user ?? null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [scope, setScope] = useState(roomId ? 'room' : 'global');
  const [duration, setDuration] = useState('24h');
  const [customHours, setCustomHours] = useState('');
  const [confirm, setConfirm] = useState(false);
  const rooms = useLoad((client) => api.modListRooms(client), []);
  const [room, setRoom] = useState(roomId ?? '');
  const action = useChatAction();
  const presets = BAN_DURATIONS.filter((d) => d.minutes <= maxBanMinutes(role));
  const minutes =
    duration === 'custom' ? Math.round(Number(customHours) * 60) : presets.find((d) => d.id === duration)?.minutes ?? 0;
  const validMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= maxBanMinutes(role);
  const ready = target && validMinutes && (scope === 'global' || room);

  async function search(event) {
    event.preventDefault();
    const rows = await action.run(() => api.modFindUsers(supabase, query.trim()));
    if (rows) setFound(rows);
  }

  return (
    <div className="card stack chat-ban-form">
      <h3>{t('chat.mod.newBan')}</h3>
      {target ? (
        <p>
          {t('chat.mod.banTarget', { name: target.name ?? '–' })}{' '}
          {!user && (
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTarget(null)}>
              {t('chat.mod.change')}
            </button>
          )}
        </p>
      ) : (
        <form className="chat-search" onSubmit={search}>
          <label className="visually-hidden" htmlFor="ban-user-search">{t('chat.mod.findUser')}</label>
          <input id="ban-user-search" type="search" value={query} placeholder={t('chat.mod.findUser')} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="btn btn--secondary btn--sm" disabled={query.trim().length < 2}>
            {t('chat.searchButton')}
          </button>
        </form>
      )}
      {!target && found && (
        <ul className="compact-list">
          {found.map((u) => (
            <li key={u.user_id} className="chat-blocked-row">
              <span>
                {u.first_name} <span className="muted">({u.school_id})</span>
              </span>
              {!u.is_staff && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTarget({ id: u.user_id, name: u.first_name })}>
                  {t('chat.mod.select')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <fieldset className="field">
        <legend>{t('chat.mod.scope')}</legend>
        {['global', 'room'].map((id) => (
          <label key={id} className="radio">
            <input type="radio" name="ban-scope" checked={scope === id} onChange={() => setScope(id)} />
            <span>{t(`chat.mod.scopes.${id}`)}</span>
          </label>
        ))}
      </fieldset>
      {scope === 'room' && rooms.status === 'ready' && (
        <div className="field">
          <label>
            {t('chat.mod.room')}
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">{t('chat.report.choose')}</option>
              {rooms.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {roomTitle({ kind: r.kind, slug: r.slug, ideaTitle: r.idea_title, eventTitle: r.event_title }, t, (v) => localize(v, language))}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="field">
        <label>
          {t('chat.mod.duration')}
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {presets.map((d) => (
              <option key={d.id} value={d.id}>{t(`chat.mod.durations.${d.id}`)}</option>
            ))}
            <option value="custom">{t('chat.mod.durations.custom')}</option>
          </select>
        </label>
        {duration === 'custom' && (
          <label>
            {t('chat.mod.customHours')}
            <input type="text" inputMode="decimal" value={customHours} onChange={(e) => setCustomHours(e.target.value)} />
          </label>
        )}
        <span className="field__hint">{t(`chat.mod.maxDuration.${role}`)}</span>
      </div>

      {!confirm ? (
        <div className="confirm__actions">
          <button type="button" className="btn btn--danger btn--sm" disabled={!ready} onClick={() => setConfirm(true)}>
            {t('chat.mod.banUser')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <ReasonConfirm
          label={t('chat.mod.banConfirm', { name: target?.name ?? '–' })}
          confirmLabel={t('chat.mod.banUser')}
          busy={action.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async (reason) => {
            const ok = await action.run(() =>
              api.modBan(supabase, { userId: target.id, scope, roomId: scope === 'room' ? room : null, minutes, reason }),
            );
            if (ok) onDone();
          }}
        />
      )}
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
    </div>
  );
}

function BansTab({ role }) {
  const { t, language } = useI18n();
  const [activeOnly, setActiveOnly] = useState(true);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(null);
  const bans = useLoad((client) => api.modListBans(client, activeOnly), [activeOnly]);
  const action = useChatAction();

  return (
    <section className="stack">
      <div className="chat-request__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(!creating)}>
          {t('chat.mod.newBan')}
        </button>
        <label className="checkbox">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          <span>{t('chat.mod.activeOnly')}</span>
        </label>
      </div>
      {creating && (
        <BanForm
          role={role}
          onDone={() => {
            setCreating(false);
            bans.reload();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {bans.status !== 'ready' ? (
        <ChatStateNotice result={bans} />
      ) : bans.data.length === 0 ? (
        <p className="muted">{t('chat.mod.noBans')}</p>
      ) : (
        <ul className="card-list">
          {bans.data.map((b) => (
            <li key={b.id} className="card stack">
              <p>
                <strong>{b.user_name}</strong> · {t(`chat.mod.scopes.${b.scope}`)}
                {b.room_slug && ` (${t(`chat.rooms.${b.room_slug}.title`)})`} ·{' '}
                <span className={`badge ${b.active ? 'badge--danger' : 'badge--muted'}`}>
                  {b.active ? t('chat.mod.active') : t('chat.mod.ended')}
                </span>
              </p>
              <p className="muted">
                {formatChatTime(b.starts_at, language)} → {formatChatTime(b.ended_at ?? b.ends_at, language)} ·{' '}
                {t('chat.mod.issuedBy', { name: b.issued_by_name ?? '–' })}
              </p>
              <p>{t('chat.mod.reason')}: {b.reason}</p>
              {b.active && ending !== b.id && (
                <div>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEnding(b.id)}>
                    {t('chat.mod.endBan')}
                  </button>
                </div>
              )}
              {ending === b.id && (
                <ReasonConfirm
                  label={t('chat.mod.endBanConfirm', { name: b.user_name })}
                  confirmLabel={t('chat.mod.endBan')}
                  danger={false}
                  busy={action.busy}
                  onCancel={() => setEnding(null)}
                  onConfirm={async (reason) => {
                    if (await action.run(() => api.modEndBan(supabase, b.id, reason))) {
                      setEnding(null);
                      bans.reload();
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
    </section>
  );
}

// ---------- Räume ----------
function RoomsTab({ role }) {
  const { t, language } = useI18n();
  // Moderation: Events OHNE Schul-Ausblendung (staffEvents), damit Eventgruppen auch für bestehende Events
  // ausgeblendeter Schulen angelegt werden können. Rechte prüft weiterhin die Datenbank (chat_create_event_room).
  const { events: studentEvents, staffEvents } = useAppState();
  const events = staffEvents ?? studentEvents;
  const rooms = useLoad((client) => api.modListRooms(client), []);
  const [panel, setPanel] = useState(null); // { id, kind: 'archive'|'unarchive'|'delete' }
  const [eventId, setEventId] = useState('');
  // Hinweis „erst nach Admin-Freigabe“ – nur nach einem Erstellungsversuch für ein nicht freigegebenes Event
  const [eventNotApproved, setEventNotApproved] = useState(false);
  const action = useChatAction();
  const localizeFn = (v) => localize(v, language);
  const openEvents = (events ?? []).filter(
    (e) => !e.isDemo && ['planned', 'confirmed'].includes(e.status) && /^[0-9a-f-]{36}$/i.test(String(e.id)),
  );

  return (
    <section className="stack">
      <div className="card stack">
        <h3>{t('chat.mod.createEventGroup')}</h3>
        <div className="chat-search">
          <label className="visually-hidden" htmlFor="event-group">{t('chat.mod.event')}</label>
          <select
            id="event-group"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setEventNotApproved(false);
            }}
          >
            <option value="">{t('chat.report.choose')}</option>
            {openEvents.map((e) => (
              <option key={e.id} value={e.id}>{localize(e.title, language)}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={!eventId || action.busy}
            onClick={async () => {
              const chosen = (events ?? []).find((e) => e.id === eventId);
              if (!canCreateEventGroup(chosen?.status)) {
                action.clear();
                setEventNotApproved(true);
                return;
              }
              setEventNotApproved(false);
              // Server prüft selbst (chat_create_event_room): nur veröffentlichte Events (planned/confirmed)
              const ok = await action.run(() =>
                api.createEventRoom(supabase, eventId).catch((error) => {
                  if (isApprovalRejection('event', error)) setEventNotApproved(true);
                  throw error;
                }),
              );
              if (ok) rooms.reload();
            }}
          >
            {t('chat.mod.create')}
          </button>
        </div>
        {eventNotApproved && <GroupApprovalNotice />}
      </div>
      {action.error && !(eventNotApproved && isApprovalRejection('event', action.raw)) && (
        <p className="notice notice--error" role="alert">{action.error}</p>
      )}
      {rooms.status !== 'ready' ? (
        <ChatStateNotice result={rooms} />
      ) : (
        <ul className="card-list">
          {rooms.data.map((r) => (
            <li key={r.id} className="card stack">
              <p>
                <Link to={`/chat/rooms/${r.id}`}>
                  {roomTitle({ kind: r.kind, slug: r.slug, ideaTitle: r.idea_title, eventTitle: r.event_title }, t, localizeFn)}
                </Link>{' '}
                <span className="badge badge--info">{t(`chat.kind.${r.kind}`)}</span>{' '}
                {r.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
              </p>
              <p className="muted">{t('chat.mod.messageCount', { count: r.message_count })}</p>
              <div className="chat-request__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel({ id: r.id, kind: r.archived ? 'unarchive' : 'archive' })}>
                  {r.archived ? t('chat.mod.unarchive') : t('chat.mod.archive')}
                </button>
                {role === 'admin' && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel({ id: r.id, kind: 'delete' })}>
                    {t('chat.mod.deleteRoom')}
                  </button>
                )}
              </div>
              {panel?.id === r.id && (
                <ReasonConfirm
                  label={t(`chat.mod.roomConfirm.${panel.kind}`)}
                  confirmLabel={t(panel.kind === 'delete' ? 'chat.mod.deleteRoom' : panel.kind === 'archive' ? 'chat.mod.archive' : 'chat.mod.unarchive')}
                  danger={panel.kind === 'delete'}
                  busy={action.busy}
                  onCancel={() => setPanel(null)}
                  onConfirm={async (reason) => {
                    const fn = panel.kind === 'delete'
                      ? () => api.adminDeleteRoom(supabase, r.id, reason)
                      : () => api.modSetRoomArchived(supabase, r.id, panel.kind === 'archive', reason);
                    if (await action.run(fn)) {
                      setPanel(null);
                      rooms.reload();
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Gespräche (nur Admins; nur Metadaten) ----------
function ConversationsTab() {
  const { t, language } = useI18n();
  const list = useLoad((client) => api.adminListConversations(client), []);
  const [panel, setPanel] = useState(null);
  const action = useChatAction();
  return (
    <section className="stack">
      <p className="notice notice--info">{t('chat.mod.conversationsHint')}</p>
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
      {list.status !== 'ready' ? (
        <ChatStateNotice result={list} />
      ) : list.data.length === 0 ? (
        <p className="muted">{t('chat.noConversations')}</p>
      ) : (
        <ul className="card-list">
          {list.data.map((c) => (
            <li key={c.id} className="card stack">
              <p>
                <strong>{c.name_a} · {c.name_b}</strong>{' '}
                {c.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
                {c.open_reports > 0 && <span className="badge badge--danger">{t('chat.mod.openReports', { count: c.open_reports })}</span>}
              </p>
              <p className="muted">
                {formatChatTime(c.created_at, language)} · {t('chat.mod.messageCount', { count: c.message_count })} · ID {c.id.slice(0, 8)}
              </p>
              <div className="chat-request__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel({ id: c.id, kind: c.archived ? 'unarchive' : 'archive' })}>
                  {c.archived ? t('chat.mod.unarchive') : t('chat.mod.archive')}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel({ id: c.id, kind: 'delete' })}>
                  {t('chat.mod.deleteConversation')}
                </button>
              </div>
              {panel?.id === c.id && (
                <ReasonConfirm
                  label={t(`chat.mod.conversationConfirm.${panel.kind}`)}
                  confirmLabel={t(panel.kind === 'delete' ? 'chat.mod.deleteConversation' : panel.kind === 'archive' ? 'chat.mod.archive' : 'chat.mod.unarchive')}
                  danger={panel.kind === 'delete'}
                  busy={action.busy}
                  onCancel={() => setPanel(null)}
                  onConfirm={async (reason) => {
                    const fn = panel.kind === 'delete'
                      ? () => api.adminDeleteConversation(supabase, c.id, reason)
                      : () => api.adminSetConversationArchived(supabase, c.id, panel.kind === 'archive', reason);
                    if (await action.run(fn)) {
                      setPanel(null);
                      list.reload();
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Protokoll ----------
function AuditTab() {
  const { t, language } = useI18n();
  const audit = useLoad((client) => api.modListAudit(client, 200), []);
  if (audit.status !== 'ready') return <ChatStateNotice result={audit} />;
  if (!audit.data.length) return <p className="muted">{t('chat.mod.noAudit')}</p>;
  return (
    <ul className="card-list">
      {audit.data.map((a) => (
        <li key={a.id} className="card">
          <p>
            <strong>{a.actor_name ?? '–'}</strong> · {t(`chat.mod.actions.${a.action}`)} ·{' '}
            <time className="muted">{formatChatTime(a.created_at, language)}</time>
          </p>
          {a.reason && <p className="muted">{t('chat.mod.reason')}: {a.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

// ---------- Einstellungen (nur Admins) ----------
function SettingsTab() {
  const { t } = useI18n();
  const config = useLoad((client) => api.adminGetConfig(client), []);
  const staff = useLoad((client) => api.adminListStaff(client), []);
  const terms = useLoad((client) => api.adminListTerms(client), []);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [modQuery, setModQuery] = useState('');
  const [modFound, setModFound] = useState(null);
  const [modPanel, setModPanel] = useState(null); // { userId, name, add }
  const [term, setTerm] = useState('');
  const [termPrefix, setTermPrefix] = useState(false);
  const [termLang, setTermLang] = useState('de');
  const action = useChatAction();

  if (config.status !== 'ready') return <ChatStateNotice result={config} />;
  const values = form ?? {
    enabled: config.data.enabled,
    cooldownHours: config.data.request_cooldown_hours,
    requestsPerDay: config.data.requests_per_day,
    messagesPerMinute: config.data.messages_per_minute,
  };
  const set = (key, value) => setForm({ ...values, [key]: value });

  return (
    <section className="stack">
      <div className="card stack">
        <h3>{t('chat.mod.settingsTitle')}</h3>
        <p className="muted">{t('chat.mod.staffCount', { count: config.data.staff_count })}</p>
        <label className="checkbox">
          <input type="checkbox" checked={values.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>
            {t('chat.mod.enabled')}
            <span className="field__hint"> {t('chat.mod.enabledHint')}</span>
          </span>
        </label>
        {[
          ['cooldownHours', 'chat.mod.cooldownHours'],
          ['requestsPerDay', 'chat.mod.requestsPerDay'],
          ['messagesPerMinute', 'chat.mod.messagesPerMinute'],
        ].map(([key, label]) => (
          <div className="field" key={key}>
            <label>
              {t(label)}
              <input type="text" inputMode="numeric" value={values[key]} onChange={(e) => set(key, e.target.value)} />
            </label>
          </div>
        ))}
        {!confirm ? (
          <div>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setConfirm(true)}>
              {t('chat.mod.save')}
            </button>
          </div>
        ) : (
          <ReasonConfirm
            label={t('chat.mod.saveConfirm')}
            confirmLabel={t('chat.mod.save')}
            danger={false}
            busy={action.busy}
            onCancel={() => setConfirm(false)}
            onConfirm={async (reason) => {
              const ok = await action.run(() =>
                api.adminSetConfig(supabase, {
                  enabled: values.enabled,
                  cooldownHours: Number(values.cooldownHours),
                  requestsPerDay: Number(values.requestsPerDay),
                  messagesPerMinute: Number(values.messagesPerMinute),
                  reason,
                }),
              );
              if (ok) {
                setConfirm(false);
                setForm(null);
                config.reload();
              }
            }}
          />
        )}
      </div>

      <div className="card stack">
        <h3>{t('chat.mod.staffTitle')}</h3>
        <p className="muted">{t('chat.mod.adminsHint')}</p>
        {staff.status === 'ready' && (
          <ul className="compact-list">
            {staff.data.map((s) => (
              <li key={s.user_id} className="chat-blocked-row">
                <span>
                  {s.first_name} · {t(`chat.mod.role.${s.role}`)}
                </span>
                {s.role === 'moderator' && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModPanel({ userId: s.user_id, name: s.first_name, add: false })}>
                    {t('chat.mod.removeModerator')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="chat-search"
          onSubmit={async (e) => {
            e.preventDefault();
            const rows = await action.run(() => api.modFindUsers(supabase, modQuery.trim()));
            if (rows) setModFound(rows);
          }}
        >
          <label className="visually-hidden" htmlFor="mod-search">{t('chat.mod.findUser')}</label>
          <input id="mod-search" type="search" value={modQuery} placeholder={t('chat.mod.findUser')} onChange={(e) => setModQuery(e.target.value)} />
          <button type="submit" className="btn btn--secondary btn--sm" disabled={modQuery.trim().length < 2}>
            {t('chat.searchButton')}
          </button>
        </form>
        {modFound && (
          <ul className="compact-list">
            {modFound.filter((u) => !u.is_staff).map((u) => (
              <li key={u.user_id} className="chat-blocked-row">
                <span>{u.first_name} <span className="muted">({u.school_id})</span></span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModPanel({ userId: u.user_id, name: u.first_name, add: true })}>
                  {t('chat.mod.addModerator')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {modPanel && (
          <ReasonConfirm
            label={t(modPanel.add ? 'chat.mod.addModeratorConfirm' : 'chat.mod.removeModeratorConfirm', { name: modPanel.name })}
            confirmLabel={t(modPanel.add ? 'chat.mod.addModerator' : 'chat.mod.removeModerator')}
            danger={!modPanel.add}
            busy={action.busy}
            onCancel={() => setModPanel(null)}
            onConfirm={async (reason) => {
              if (await action.run(() => api.adminSetModerator(supabase, modPanel.userId, modPanel.add, reason))) {
                setModPanel(null);
                setModFound(null);
                staff.reload();
                config.reload();
              }
            }}
          />
        )}
      </div>

      <div className="card stack">
        <h3>{t('chat.mod.termsTitle')}</h3>
        <p className="muted">{t('chat.mod.termsHint')}</p>
        <form
          className="chat-search"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run(() => api.adminSetTerm(supabase, term, termPrefix, termLang, true))) {
              setTerm('');
              terms.reload();
            }
          }}
        >
          <label className="visually-hidden" htmlFor="term-input">{t('chat.mod.term')}</label>
          <input id="term-input" type="text" value={term} placeholder={t('chat.mod.term')} onChange={(e) => setTerm(e.target.value)} />
          <select value={termLang} onChange={(e) => setTermLang(e.target.value)} aria-label={t('chat.mod.termLanguage')}>
            {['de', 'tr', 'en', 'other'].map((l) => (
              <option key={l} value={l}>{t(`chat.mod.languages.${l}`)}</option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={termPrefix} onChange={(e) => setTermPrefix(e.target.checked)} />
            <span>{t('chat.mod.termPrefix')}</span>
          </label>
          <button type="submit" className="btn btn--secondary btn--sm" disabled={term.trim().length < 2 || action.busy}>
            {t('chat.mod.addTerm')}
          </button>
        </form>
        {terms.status === 'ready' && (
          <details className="disclosure">
            <summary>{t('chat.mod.showTerms', { count: terms.data.length })}</summary>
            <ul className="chat-terms">
              {terms.data.map((x) => (
                <li key={x.term_norm}>
                  <code>{x.term_norm}</code> {x.match_prefix && <span className="badge badge--muted">{t('chat.mod.prefix')}</span>}{' '}
                  <button
                    type="button"
                    className="btn btn--ghost btn--xs"
                    disabled={action.busy}
                    onClick={async () => (await action.run(() => api.adminSetTerm(supabase, x.term_norm, false, x.language, false))) && terms.reload()}
                  >
                    {t('chat.mod.removeTerm')}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
    </section>
  );
}
