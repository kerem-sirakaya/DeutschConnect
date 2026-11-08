import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useDemo } from './DemoContext.jsx';
import { chessInvitationEvents, validChessNoticeKey } from '../../supabase/functions/_shared/chessInvitations.js';

const Context = createContext(null);
const receiptKey = (mode,id) => 'deutschconnect.chess-read.v1:'+mode+':'+encodeURIComponent(id);
function readReceipts(key) {
  try { const raw=localStorage.getItem(key); if(raw===null)return {keys:[],available:true}; const keys=JSON.parse(raw); if(!Array.isArray(keys)||!keys.every(validChessNoticeKey))throw new Error(); return {keys,available:true}; }
  catch { return {keys:[],available:false}; }
}
export function ChessNotificationProvider({children}) {
  const {state,profile,access,dispatch} = useDemo();
  const key = receiptKey(access.mode,profile.id);
  const [local,setLocal] = useState(() => readReceipts(key));
  const [receiptFailed,setReceiptFailed] = useState(false);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const synchronized = access.mode === 'guest' || state.modules.chessNotificationCapabilities?.inApp === true;
  const read = new Set(synchronized ? state.modules.chessRead?.[profile.id] || [] : local.keys);
  const events = chessInvitationEvents(state,profile.id).map((event) => ({...event,unread:event.canRead && !read.has(event.key)}));
  const unread = events.filter((event) => event.unread);
  useEffect(() => {
    const sync = (event) => { if(event.key===key || event.key===null)setLocal(readReceipts(key)); };
    window.addEventListener('storage',sync); return () => window.removeEventListener('storage',sync);
  },[key]);
  async function markRead(keys) {
    if(!active.current)return false;
    if (!keys.length) return true;
    if (synchronized) {
      try { for(let offset=0;offset<keys.length;offset+=100){if(!active.current)return false;if(!await dispatch({type:'readChessNotices',keys:keys.slice(offset,offset+100)})){setReceiptFailed(true);return false;}}setReceiptFailed(false);return true; }
      catch {setReceiptFailed(true);return false;}
    }
    const next=[...new Set([...local.keys,...keys])];
    try { if(!local.available)throw new Error();localStorage.setItem(key,JSON.stringify(next));setLocal({keys:next,available:true});setReceiptFailed(false);return true; }
    catch {setLocal({keys:next,available:false});setReceiptFailed(true);return false;}
  }
  return <Context.Provider value={{events,unread,markRead,receiptFailed,synchronized}}>{children}</Context.Provider>;
}
export const useChessNotifications = () => useContext(Context);
