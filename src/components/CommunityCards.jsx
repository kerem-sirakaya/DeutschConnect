import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import InterestToggle from './InterestToggle.jsx';
import ReportControl from './ReportControl.jsx';
import Icon from './Icon.jsx';
import { normalizeTopic } from '../data/matching.js';
import ActionButton from './ActionButton.jsx';

export function MemberCard({ member }) {
  const { t } = useLanguage();
  const { profile,access } = useDemo();
  const memberTopics = [...member.interests, ...(member.customInterests || [])];
  const ownTopics = new Set([...profile.interests, ...(profile.customInterests || [])].map(normalizeTopic));
  const common = new Set(memberTopics.map(normalizeTopic).filter((key) => ownTopics.has(key)));
  return <article className="content-card member-card">
    <div className="member-heading"><span className="avatar">{member.displayName.slice(0, 1)}</span><div><h2><a href={'#/community/people/' + member.id}>{member.displayName}</a></h2><p className="small-text">{member.schoolId === 'ers' ? 'ERS' : 'Anka Bilim'}{access.mode === 'guest' ? ' · DEMO' : ''}</p></div></div>
    <div className="topic-tags">{memberTopics.map((key) => <span key={key}>{t.categories[key] || key}</span>)}</div>
    <p className="small-text">{t.ext.community.common}: {common.size}</p>
    <a className="text-link" href={'#/community/people/' + member.id}>{t.details}<Icon name="arrow" size={16} /></a>
  </article>;
}

export function MessageCard({ message, showRoom = false }) {
  const { t } = useLanguage();
  const { state, profile, dispatch, access } = useDemo();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const own = message.ownerId === profile.id;
  async function remove() {
    setBusy(true);
    setFailed(false);
    try { setFailed(!await dispatch({ type: 'removeMessage', id: message.id })); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <article className="content-card message-card">
    <div className="task-eyebrow"><strong>{state.profiles[message.ownerId].displayName}</strong>{access.mode === 'guest' && <span className="demo-tag">DEMO</span>}{showRoom && <a className="text-link" href={'#/community/rooms/' + message.roomId}>{t.ext.roomNames[message.roomId] || state.modules.groups?.find((g)=>g.id===message.roomId)?.title || t.real.groups}</a>}</div>
    <p className="user-content">{message.body}</p>
    {own ? <button className="text-button" type="button" disabled={busy} onClick={remove}>{busy ? t.quality.saving : t.ext.community.remove}</button> : <ReportControl targetType="message" targetId={message.id} />}
    {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
  </article>;
}

export function MemberActions({ member }) {
  const { t } = useLanguage();
  const { state,profile } = useDemo();
  return <><InterestToggle targetType="person" targetId={member.id} label={t.ext.community.connect} withdraw={t.ext.community.disconnect} /><a className="button button-secondary" href="#/community/games/chess">{t.games.challenge}</a><ActionButton action={{ type:'blockPerson',profileId:member.id,blocked:!state.modules.blocks?.[profile.id]?.includes(member.id) }}>{state.modules.blocks?.[profile.id]?.includes(member.id) ? t.real.unblock : t.real.block}</ActionButton><ReportControl targetType="person" targetId={member.id} /></>;
}
import { useState } from 'react';
