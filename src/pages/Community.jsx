import { useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { interests } from '../data/activities.js';
import { rooms, visibleMembers } from '../data/modules.js';
import { CommunityNavigation } from '../components/ModuleNavigation.jsx';
import { MemberActions, MemberCard, MessageCard } from '../components/CommunityCards.jsx';
import { EmptyState, PageIntro, SearchField } from '../components/UI.jsx';
import { TextField } from '../components/FormFields.jsx';
import IdeaCard, { ideaContent } from '../components/IdeaCard.jsx';
import Icon from '../components/Icon.jsx';
import NotFound from './NotFound.jsx';
import { useFormDraft, useRememberedState } from '../state/usePageMemory.js';
import { isActive, memberMatchScore, normalizeTopic, projectMatchScore } from '../data/matching.js';
import { groupFor } from '../../supabase/functions/_shared/platform.js';
import { blocked } from '../../supabase/functions/_shared/social.js';
import ActionButton from '../components/ActionButton.jsx';

export default function Community({ section = 'people', personId, roomId }) {
  const { t, language } = useLanguage();
  const { state, profile, dispatch, access } = useDemo();
  const [filters, setFilters] = useRememberedState('community:' + section, { query: '', interest: '' });
  const { query, interest } = filters;
  const changeFilter = (key, value) => setFilters({ ...filters, [key]: value });
  const { draft: body, setDraft: setBody, clearDraft, hasDraft, storageAvailable } = useFormDraft('community:room:' + (roomId || 'none'), '');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(false);
  const members = visibleMembers(state);
  const member = members.find((item) => item.id === personId);
  const roomItems = access.mode === 'account' ? state.modules.groups : [...rooms.map((id) => ({ id,kind:'topic',memberIds:Object.keys(state.profiles) })),...(state.modules.groups || []).filter((g) => !rooms.includes(g.id))];
  const group = roomId ? groupFor(state,roomId) || roomItems.find((g) => g.id === roomId) : null;
  const canRead = !roomId || group?.memberIds.includes(profile.id) || profile.isModerator;
  const canWrite = canRead && !group?.closed && (access.mode === 'guest' || state.modules.moderationAvailable);
  const roomTitle = group?.title || t.ext.roomNames[roomId] || t.real.groups;
  if ((personId && (!member || blocked(state,profile.id,personId))) || (roomId && !group)) return <NotFound />;

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    if (body.trim().length < 3 || body.length > 1200) { setError(true); event.currentTarget.elements.namedItem('room-body').focus(); return; }
    busy.current = true; setPending(true); setError(false); setSaveFailed(false);
    try {
      if (!await dispatch({ type: 'postMessage', id: 'local-' + crypto.randomUUID(), roomId, body })) { setSaveFailed(true); return; }
      setBody(''); clearDraft();
    } catch { setSaveFailed(true); }
    finally { busy.current = false; setPending(false); }
  }

  if (member) {
    const projects = state.ideas.filter((idea) => isActive(idea) && (idea.ownerId === member.id || projectMatchScore(idea, member) > 0));
    return <>
      <a className="text-link back-link" href="#/community/people">← {t.app.back}</a>
      <PageIntro eyebrow={t.ext.community.shared} title={member.displayName + (access.mode === 'guest' ? ' · DEMO' : '')} description={member.schoolId === 'ers' ? 'Ernst-Reuter-Schule Ankara' : member.schoolId === 'anka' ? 'Anka Bilim' : t.real.noSchool} />
      <article className="content-card"><div className="topic-tags">{[...member.interests, ...(member.customInterests || [])].map((key) => <span key={key}>{t.categories[key] || key}</span>)}</div><p>{t.ext.community.contactFree}</p>{member.demoShared && <p className="small-text">{t.ext.community.guestHint}</p>}{member.id !== profile.id && <div className="form-actions"><MemberActions member={member} /></div>}</article>
      {projects.length > 0 && <section className="section-block"><h2>{t.ext.community.projects}</h2><div className="task-list">{projects.map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo="/community/projects" />)}</div></section>}
    </>;
  }

  const ownPosts = state.modules.messages.filter((message) => message.ownerId === profile.id);
  const connections = members.filter((item) => state.modules.interests[profile.id].includes('person:' + item.id));
  const memberInterests = (item) => [...item.interests, ...(item.customInterests || [])];
  const filterInterests = [...new Set([...interests, ...members.flatMap((item) => item.customInterests || [])])];
  const filteredMembers = members.filter((item) => item.id !== profile.id && !blocked(state,profile.id,item.id) && (!interest || memberInterests(item).some((key) => normalizeTopic(key) === normalizeTopic(interest))) && (item.displayName + ' ' + memberInterests(item).map((key) => t.categories[key] || key).join(' ')).toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language))).sort((a, b) => memberMatchScore(b, profile) - memberMatchScore(a, profile));
  const projects = state.ideas.filter((idea) => { const content = ideaContent(idea, t); return isActive(idea) && (content.title + ' ' + content.description + ' ' + (idea.topics || []).join(' ')).toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)); }).sort((a, b) => projectMatchScore(b, profile) - projectMatchScore(a, profile));
  const messages = state.modules.messages.filter((message) => message.roomId === roomId && !blocked(state,profile.id,message.ownerId));

  return <>
    {roomId && <a className="text-link back-link" href="#/community/rooms">← {t.ext.community.rooms}</a>}
    <PageIntro title={roomId ? roomTitle : t.ext.community.title} description={roomId ? t.ext.roomDescriptions[roomId] : t.ext.community.description} />
    <CommunityNavigation active={section} />
    {section === 'people' && <>
      <div className="content-card visibility-card"><label><input type="checkbox" checked={state.modules.visibility[profile.id]} onChange={(event) => dispatch({ type: 'setCommunityVisibility', visible: event.target.checked })} /><span>{t.ext.community.visibility}</span></label><p className="small-text">{t.ext.community.privacy}</p></div>
      <div className="search-toolbar"><SearchField label={t.ext.community.search} value={query} onChange={(value) => changeFilter('query', value)} /><label className="select-field"><span className="sr-only">{t.ext.community.filterInterest}</span><select value={interest} onChange={(event) => changeFilter('interest', event.target.value)}><option value="">{t.ext.community.allInterests}</option>{filterInterests.map((key) => <option key={key} value={key}>{t.categories[key] || key}</option>)}</select></label></div>
      <div className="initiative-grid">{filteredMembers.map((item) => <MemberCard key={item.id} member={item} />)}</div>{!filteredMembers.length && <EmptyState text={t.app.noResults} icon="user" />}
    </>}
    {section === 'projects' && <><p className="module-note">{t.ext.community.projectHint}</p><div className="search-toolbar"><SearchField label={t.app.searchIdeas} value={query} onChange={(value) => changeFilter('query', value)} /></div><div className="task-grid">{projects.map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo="/community/projects" />)}</div>{!projects.length && <EmptyState icon="bulb" text={t.app.noResults} />}</>}
    {section === 'rooms' && !roomId && <div className="initiative-grid">{roomItems.map(({id,title}) => <article className="content-card" key={id}><Icon name="chat" size={26} /><h2><a href={'#/community/rooms/' + id}>{title || t.ext.roomNames[id]}</a></h2><p>{t.ext.roomDescriptions[id]}</p><a className="text-link" href={'#/community/rooms/' + id}>{t.ext.discover.openModule}<Icon name="arrow" size={16} /></a></article>)}</div>}
    {section === 'rooms' && roomId && <>
      {access.mode === 'account' && group.kind === 'topic' && <div className="group-actions"><ActionButton action={{ type:canRead ? 'leaveGroup':'joinGroup',id:roomId }}>{canRead ? t.real.leaveGroup : t.real.joinGroup}</ActionButton></div>}
      {!canRead && <p className="form-notice">{t.real.groupRequired}</p>}
      {canRead && <>
      <p className="form-notice local-banner">{t.ext.community.localHint}</p>
      {access.mode === 'account' && <p className="small-text">{t.real.polling}</p>}
      {access.mode === 'account' && !state.modules.moderationAvailable && <p className="form-notice">{t.real.moderationRequired}</p>}
      <div className="task-list message-list">{messages.map((message) => <MessageCard key={message.id} message={message} />)}</div>
      {!messages.length && <EmptyState icon="chat" text={t.ext.community.emptyRoom} />}
      {canWrite && <form className="content-card app-form room-form" onSubmit={submit} noValidate aria-busy={pending}><h2>{t.ext.community.write}</h2><TextField id="room-body" label={t.ext.community.body} value={body} onChange={setBody} multiline maxLength={1200} required disabled={pending} error={error ? t.ext.community.validation : undefined} />{hasDraft && <p className="small-text" role="status">{storageAvailable ? t.quality.savedDraft : t.quality.unsavedWarning}</p>}{saveFailed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}<p className="small-text">{t.app.privacyHint}</p><button className="button" type="submit" disabled={pending}>{pending ? t.quality.saving : t.ext.community.post}</button></form>}
    </>}
    </>}
    {section === 'my' && <><section className="section-block"><h2>{t.ext.community.ownPosts}</h2><div className="task-list">{ownPosts.map((message) => <MessageCard key={message.id} message={message} showRoom />)}</div>{!ownPosts.length && <EmptyState icon="chat" text={t.ext.community.noActivity} />}</section><section className="section-block"><h2>{t.ext.community.ownConnections}</h2><div className="initiative-grid">{connections.map((item) => <MemberCard key={item.id} member={item} />)}</div>{!connections.length && <p className="small-text">{t.ext.community.noActivity}</p>}</section></>}
    <details className="disclosure"><summary>{t.ext.community.moderation}</summary><p>{t.ext.community.backendHint}</p></details>
    {section === 'my' && <section className="section-block"><h2>{t.real.blocked}</h2><p className="module-note">{t.real.blockHint}</p>{(state.modules.blocks?.[profile.id] || []).map((id) => <div className="request-review-row" key={id}><span>{state.profiles[id]?.displayName || id.slice(0,8)}</span><ActionButton action={{ type:'blockPerson',profileId:id,blocked:false }}>{t.real.unblock}</ActionButton></div>)}</section>}
  </>;
}
