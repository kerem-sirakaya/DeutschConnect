import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { sendConversationMessage, setBlock } from '../lib/chatApi.js';
import { useChatConversation } from '../state/useChat.js';
import PageHeader from '../components/PageHeader.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageComposer from '../components/chat/MessageComposer.jsx';
import ReportForm from '../components/chat/ReportForm.jsx';
import { ChatStateNotice, formatChatTime, useChatAction } from '../components/chat/chatUi.jsx';

/** Privates 1:1-Gespräch (/chat/conversations/:conversationId) – erst nach angenommener Anfrage. */
export default function ChatConversationPage() {
  const { conversationId } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { detail, messages, markDisplayed } = useChatConversation(conversationId);
  const [panel, setPanel] = useState(null); // 'report' | 'block'
  const action = useChatAction();

  if (detail.status !== 'ready' || !detail.data) {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('chat.privateTitle')} backTo="/chat?tab=private" />
        {detail.status === 'error' && detail.errorKey === 'chat.errors.noAccess' ? (
          <p className="notice notice--info">{t('chat.conversationUnavailable')}</p>
        ) : (
          <ChatStateNotice result={detail} />
        )}
      </div>
    );
  }

  const conversation = detail.data;
  let disabledText = null;
  if (conversation.archived) disabledText = t('chat.archivedConversationHint');
  else if (conversation.banEndsAt) disabledText = t('chat.errors.banned', { until: formatChatTime(conversation.banEndsAt, language) });

  async function block() {
    if (await action.run(() => setBlock(supabase, conversation.otherId, true))) navigate('/chat?tab=private');
  }

  return (
    <div className="page page--narrow chat-page">
      <PageHeader title={conversation.otherName} subtitle={t('chat.privateTitle')} backTo="/chat?tab=private" />
      <p className="chat-context">
        <span className="badge badge--neutral">{t('chat.kind.private')}</span>
        {conversation.archived && <span className="badge badge--muted">{t('chat.archived')}</span>}
        <span className="muted">{t('chat.privateContextHint')}</span>
      </p>

      {messages.status === 'ready' ? (
        <section className="card chat-thread" aria-label={conversation.otherName}>
          <MessageList
            messages={messages.data}
            canInteract={!disabledText}
            onChanged={messages.reload}
            emptyText={t('chat.noMessagesYet')}
            onDisplayed={markDisplayed}
          />
          <MessageComposer
            send={(body) => sendConversationMessage(supabase, conversationId, body)}
            onSent={messages.reload}
            disabledText={disabledText}
          />
        </section>
      ) : (
        <ChatStateNotice result={messages} />
      )}

      <div className="chat-request__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel(panel === 'report' ? null : 'report')}>
          {t('chat.reportConversation')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel(panel === 'block' ? null : 'block')}>
          {t('chat.block')}
        </button>
      </div>
      {panel === 'report' && <ReportForm targetType="conversation" targetId={conversationId} onCancel={() => setPanel(null)} />}
      {panel === 'block' && (
        <div className="confirm" role="group" aria-label={t('chat.blockConfirm', { name: conversation.otherName })}>
          <p>{t('chat.blockConfirm', { name: conversation.otherName })}</p>
          <div className="confirm__actions">
            <button type="button" className="btn btn--danger btn--sm" disabled={action.busy} onClick={block}>
              {t('chat.block')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanel(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {action.error && <p className="notice notice--error" role="alert">{action.error}</p>}
    </div>
  );
}
