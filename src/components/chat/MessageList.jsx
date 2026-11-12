import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { CHAT_EMOJIS } from '../../lib/chat.js';
import { deleteOwnMessage, toggleReaction } from '../../lib/chatApi.js';
import { formatChatTime, useChatAction } from './chatUi.jsx';
import ReportForm from './ReportForm.jsx';
import Avatar from '../Avatar.jsx';

/**
 * Nachrichtenliste für Gruppenräume und private Gespräche.
 * Zeigt Name, Zeit, Text (immer die zensierte Fassung aus der Datenbank), Reaktionen,
 * „Löschen“ für eigene und „Melden“ für fremde Nachrichten.
 * canInteract = false → nur lesen (archiviert, gesperrt).
 */
export default function MessageList({ messages, canInteract, onChanged, emptyText, onDisplayed }) {
  const { t, language } = useI18n();
  const end = useRef(null);
  const count = messages.length;

  // Bei neuen Nachrichten ans Ende scrollen (nur innerhalb der Liste).
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  // Lesestand (020): erst NACHDEM diese Nachrichten im Bildschirm stehen (Effekt läuft nach dem
  // Zeichnen). onDisplayed ändert sich nur bei einer neuen Ladung – je Ladung höchstens ein Aufruf.
  useEffect(() => {
    onDisplayed?.();
  }, [onDisplayed]);

  if (!count) return <p className="muted chat-empty">{emptyText}</p>;

  return (
    <ol className="chat-messages" aria-label={t('chat.messagesLabel')}>
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          language={language}
          canInteract={canInteract}
          onChanged={onChanged}
        />
      ))}
      <li ref={end} aria-hidden="true" className="chat-messages__end" />
    </ol>
  );
}

function MessageItem({ message, language, canInteract, onChanged }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(null); // 'react' | 'report' | 'delete'
  const action = useChatAction();

  async function react(emoji) {
    if (await action.run(() => toggleReaction(supabase, message.id, emoji))) {
      setMenu(null);
      onChanged();
    }
  }

  async function remove() {
    if (await action.run(() => deleteOwnMessage(supabase, message.id))) {
      setMenu(null);
      onChanged();
    }
  }

  return (
    <li className={`chat-message-row${message.isOwn ? ' chat-message-row--own' : ''}`}>
      <Avatar profile={{ firstName: message.senderName, avatarColor: message.senderAvatarColor ?? undefined }} size="sm" />
      <div className={`chat-message${message.isOwn ? ' chat-message--own' : ''}`}>
      <div className="chat-message__meta">
        <span className="chat-message__name">{message.isOwn ? t('chat.you') : message.senderName}</span>
        <time dateTime={message.createdAt}>{formatChatTime(message.createdAt, language)}</time>
      </div>
      {message.deleted ? (
        <p className="chat-message__body chat-message__body--deleted">{t('chat.deletedMessage')}</p>
      ) : (
        <p className="chat-message__body">{message.body}</p>
      )}
      {message.isOwn && message.censored && !message.deleted && (
        <p className="chat-message__hint">{t('chat.censoredHint')}</p>
      )}

      {!message.deleted && message.reactions.length > 0 && (
        <div className="chat-reactions" role="group" aria-label={t('chat.reactionsLabel')}>
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`chat-reaction${r.mine ? ' chat-reaction--mine' : ''}`}
              aria-pressed={r.mine}
              aria-label={t('chat.reactionCount', { emoji: r.emoji, count: r.count })}
              disabled={!canInteract || action.busy}
              onClick={() => react(r.emoji)}
            >
              <span aria-hidden="true">{r.emoji}</span> {r.count}
            </button>
          ))}
        </div>
      )}

      {!message.deleted && (
        <div className="chat-message__actions">
          {canInteract && (
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setMenu(menu === 'react' ? null : 'react')}>
              {t('chat.react')}
            </button>
          )}
          {message.isOwn ? (
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setMenu(menu === 'delete' ? null : 'delete')}>
              {t('chat.delete')}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setMenu(menu === 'report' ? null : 'report')}>
              {t('chat.reportAction')}
            </button>
          )}
        </div>
      )}

      {menu === 'react' && (
        <div className="chat-emoji-picker" role="group" aria-label={t('chat.chooseReaction')}>
          {CHAT_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="chat-emoji" disabled={action.busy} onClick={() => react(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
      {menu === 'delete' && (
        <div className="confirm" role="group" aria-label={t('chat.deleteConfirm')}>
          <p>{t('chat.deleteConfirm')}</p>
          <div className="confirm__actions">
            <button type="button" className="btn btn--danger btn--sm" disabled={action.busy} onClick={remove}>
              {t('chat.delete')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMenu(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {menu === 'report' && (
        <ReportForm targetType="message" targetId={message.id} onCancel={() => setMenu(null)} />
      )}
      {action.error && (
        <p className="notice notice--error" role="alert">
          {action.error}
        </p>
      )}
      </div>
    </li>
  );
}
