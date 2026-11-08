import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { useChessNotifications } from '../state/ChessNotificationContext.jsx';

export function ChessNotificationLink() {
  const {t} = useLanguage(), {unread} = useChessNotifications();
  return <a className="notification-link" href="#/me/notifications" aria-label={t.chessNotices.title+' · '+t.chessNotices.unread+': '+unread.length}>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {unread.length > 0 && <span className="notification-count">{unread.length}</span>}
  </a>;
}

export function ChessNotificationBanner() {
  const {t} = useLanguage(), {unread} = useChessNotifications();
  const first = unread.find((event) => event.kind === 'invited') || unread[0];
  if (!first) return null;
  return <aside className="chess-notification-banner" aria-label={t.chessNotices.title}><p role="status">{t.chessNotices.kinds[first.kind]} · {first.otherName}</p><a className="text-link" href="#/me/notifications">{t.chessNotices.view} ({unread.length})</a></aside>;
}

export default function ChessInvitations() {
  const {t} = useLanguage(), copy=t.chessNotices;
  const {dispatch,access} = useDemo();
  const {events,unread,markRead,receiptFailed,synchronized} = useChessNotifications();
  const [busy,setBusy]=useState(false), [failed,setFailed]=useState(false);
  const running=useRef(false);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function respond(event,response) {
    if(running.current)return;running.current=true;setBusy(true);setFailed(false);
    try {
      const success=await dispatch({type:'respondChess',id:event.challengeId,response});
      if(!active.current)return;
      if(!success){setFailed(true);return;}
      if(response==='accepted'){await markRead([event.challengeId+':accepted']);if(active.current)window.location.hash='/community/games/chess/'+event.challengeId+'-game';}
    }catch{setFailed(true);}finally{running.current=false;setBusy(false);}
  }
  async function read(keys){setBusy(true);try{await markRead(keys);}finally{setBusy(false);}}
  return <section className="chess-invitations" aria-busy={busy}>
    <p className="form-notice">{access.mode==='guest'?copy.demoHint:copy.liveHint}</p>
    <p className="module-note">{copy.emailMissing}</p>
    {!synchronized && <p className="small-text">{copy.localRead}</p>}
    {unread.length > 0 && <button className="button button-secondary" type="button" disabled={busy} onClick={() => read(unread.map((event)=>event.key))}>{copy.readAll}</button>}
    {!events.length && <p className="content-card">{copy.empty}</p>}
    <div className="task-list">{events.map((event) => <article className={'content-card chess-invitation '+(event.unread?'notice-unread':'')} key={event.key}>
      <h2>{copy.kinds[event.kind]}</h2><p>{event.otherName}</p>{event.unread && <span className="participation-status">{copy.unread}</span>}
      <div className="form-actions">
        {event.kind==='invited' && <><button className="button" type="button" disabled={busy} onClick={()=>respond(event,'accepted')}>{copy.acceptPlay}</button><button className="button button-secondary" type="button" disabled={busy} onClick={()=>respond(event,'declined')}>{t.games.decline}</button></>}
        {event.kind==='sent' && <button className="text-button" type="button" disabled={busy} onClick={()=>respond(event,'cancelled')}>{t.games.cancel}</button>}
        {event.gameId && <a className="button" href={'#/community/games/chess/'+event.gameId} onClick={()=>markRead([event.key])}>{event.finished?copy.viewGame:copy.joinGame}</a>}
        {event.unread && <button className="text-button" type="button" disabled={busy} onClick={()=>read([event.key])}>{copy.read}</button>}
      </div>
    </article>)}</div>
    <a className="text-link" href="#/community/games/chess">{copy.newInvite}</a>
    {(failed||receiptFailed) && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
  </section>;
}
