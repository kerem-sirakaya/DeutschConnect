import { routeFromHash } from '../data/navigation.js';

// Uses Supabase's documented Auth/REST endpoints. No secrets or SQL privileges
// in the browser. The backend verifies the bearer token again for every call.
export function readBackendConfig(env = {}) {
  const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  let target; try { target = new URL(url); } catch { return null; }
  if (target.username || target.password || target.search || target.hash || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost','127.0.0.1'].includes(target.hostname)))) return null;
  if (key.startsWith('sb_secret_')) return null;
  if (key.split('.').length === 3) { try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if (payload.role !== 'anon') return null; } catch { return null; } }
  else if (!key.startsWith('sb_publishable_')) return null;
  return { url, key };
}

export function createSupabaseService({ config, fetcher = globalThis.fetch, storage, locks, location, history } = {}) {
  const storageKey = 'deutschconnect.auth.' + (config ? new URL(config.url).host : 'disabled');
  let session = null, user = null, initialized = false, authGeneration = 0, memoryOnly = false;
  let pending = Promise.resolve(); const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const read = () => { if(!storage)return undefined;let raw;try{raw=storage.getItem(storageKey);}catch{return undefined;}try{return raw===null?null:JSON.parse(raw);}catch{return null;} };
  const save = (value) => { session = value; try { if(!storage)throw new Error('storage');if (value) storage.setItem(storageKey,JSON.stringify(value)); else storage.removeItem(storageKey);memoryOnly=false; } catch { memoryOnly=true; } };
  async function request(path, { body, token, method = 'POST' } = {}) {
    if (!config) throw new Error('not-configured');
    let response;
    try { response = await fetcher(config.url + path,{ method, headers:{ apikey:config.key, 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer ' + token } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}), cache:'no-store', signal:AbortSignal.timeout(15000) }); }
    catch { throw new Error('network'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error_code || data.code || (typeof data.error === 'string' ? data.error : '') || (response.status === 429 ? 'rate-limit' : 'request-failed')); error.status = response.status; throw error; }
    return data;
  }
  const normalize = (value) => ({ access_token:value.access_token, refresh_token:value.refresh_token, expires_at:value.expires_at || Math.floor(Date.now()/1000) + Number(value.expires_in || 3600) });
  const confirmationRedirect = () => location?.origin ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '';
  const clearCallback = () => history?.replaceState({...history.state,dcRoute:'/me/account',...(history.state?.dcPrevious?{dcPrevious:routeFromHash(history.state.dcPrevious)}:{})},'',location.pathname + location.search + '#/me/account');
  async function refresh() {
    const work = async () => {
      const marker = authGeneration;
      const stored = read();
      const latest = stored === undefined || (memoryOnly && stored === null) ? session : stored;
      if (!latest?.refresh_token) throw new Error('account-required');
      if (latest.expires_at > Date.now()/1000 + 45) { session = latest; return latest.access_token; }
      try { const data = await request('/auth/v1/token?grant_type=refresh_token',{ body:{ refresh_token:latest.refresh_token } }); if (marker !== authGeneration) throw new Error('account-required'); save(normalize(data)); return session.access_token; }
      catch (error) { if (marker === authGeneration && (error.status === 400 || error.status === 401)) { save(null); user = null; emit(); } throw error; }
    };
    if (locks?.request) return locks.request(storageKey + '.refresh',work);
    const operation = pending.then(work); pending = operation.catch(() => {}); return operation;
  }
  async function verify() {
    const marker = authGeneration;
    const token = await refresh();
    const value = await request('/auth/v1/user',{ method:'GET', token });
    if (marker !== authGeneration || session?.access_token !== token) throw new Error('account-required');
    if (!value.id || !value.email_confirmed_at) throw new Error('verification-required');
    user = { id:value.id, email:value.email, confirmed:true }; emit(); return user;
  }
  async function initialize() {
    if (initialized || !config) return;
    const marker = authGeneration;
    initialized = true;
    const hash = location?.hash?.slice(1) || '';
    const params = new URLSearchParams(hash);
    let callbackError = '';
    if (params.has('error') || params.has('error_code')) {
      // Auth callbacks are not app routes. Never render provider descriptions
      // from the URL, and do not discard a valid session for a reused link.
      clearCallback();
      callbackError = params.get('error_code') === 'otp_expired' ? 'confirmation-link-expired' : 'confirmation-link-invalid';
      session = read();
    } else if (params.has('access_token')) {
      const access = params.get('access_token'), refreshToken = params.get('refresh_token');
      // Remove credentials from the URL before rendering or following links.
      clearCallback();
      if (access && refreshToken) save(normalize({ access_token:access, refresh_token:refreshToken, expires_in:Number(params.get('expires_in')) || 3600 }));
    } else session = read();
    if (session) { try { await verify(); } catch (error) { if (marker === authGeneration) { user = null; if (error.status === 401 || error.message === 'verification-required') save(null); } } }
    emit();
    if (callbackError) throw new Error(callbackError);
  }
  async function signIn(email,password) {
    const marker = ++authGeneration;
    const data = await request('/auth/v1/token?grant_type=password',{ body:{ email,password } });
    if (marker !== authGeneration) throw new Error('account-required');
    save(normalize(data)); try { await verify(); } catch (error) { if (marker === authGeneration) { save(null); user = null; } throw error; }
  }
  async function signUp(email,password,displayName,language) {
    await request('/auth/v1/signup' + confirmationRedirect(),{ body:{ email,password,data:{ displayName,language } } });
    // Never infer verification or session from the signup response.
  }
  async function signOut() {
    const marker = ++authGeneration, target = user?.id;
    try {
      if (session) { const token = await refresh(); const identity = await request('/auth/v1/user',{ method:'GET',token }); if (marker !== authGeneration || (target && identity.id !== target)) throw new Error('account-required'); await request('/auth/v1/logout',{token}); }
    }
    finally { if (marker === authGeneration) { save(null); user = null; emit(); } }
  }
  return {
    configured:Boolean(config), getUser:() => user, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, initialize, signIn, signUp, signOut,
    resend: (email) => request('/auth/v1/resend' + confirmationRedirect(),{ body:{ type:'signup',email } }),
    async synchronize(event) {
      if(event?.type==='storage' && event.key!==null && event.key!==storageKey)return;
      const stored=read();
      const latest=stored===undefined || (memoryOnly && stored===null && event?.type!=='storage')?session:stored;
      const changed=latest?.access_token!==session?.access_token || latest?.refresh_token!==session?.refresh_token;
      if(!changed && event?.type==='storage')return; // No-op events must not cancel in-flight work.
      const marker=changed?++authGeneration:authGeneration;session=latest;
      if(!session){user=null;emit();return;}
      try{await verify();}
      catch(error){if(marker===authGeneration && (changed || error.status===401 || error.message==='verification-required')){user=null;if(error.status===401 || error.message==='verification-required')save(null);emit();}throw error;}
    },
    async platform(action, commandId) {
      const expectedUser = user?.id;
      const token = await refresh();
      const identity = await request('/auth/v1/user',{ method:'GET',token });
      if (!expectedUser || identity.id !== expectedUser || user?.id !== expectedUser) throw new Error('account-required');
      const response = await request('/functions/v1/platform',{ token, body:action ? { action,commandId } : {} });
      if (response.protocol !== 1 || response.state?.activeId !== expectedUser || !response.state.profiles?.[expectedUser]) throw new Error('invalid-response');
      return response;
    },
  };
}
