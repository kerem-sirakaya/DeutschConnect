import { emptyPlatform, addAccount, applyPlatformAction, projectPlatform } from './platform.js';

// The production HTTP boundary is reused by local integration tests.
export function createPlatformHandler({url, serviceKey, publicKey, origins, moderators, fetcher=globalThis.fetch}) {
  async function database(path, body) {
    const result = await fetcher(url + '/rest/v1/' + path, { method:body ? 'POST':'GET', headers:{ apikey:serviceKey, Authorization:'Bearer ' + serviceKey, 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
    if (!result.ok) throw new Error('database-unavailable');
    return result.json();
  }
  return async (request) => {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Cache-Control':'no-store', Vary:'Origin' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null,{ headers });
    if (request.method !== 'POST' || (origin && !origins.includes(origin))) return reply({ error:'not-allowed' },403);
    try {
      const authorization = request.headers.get('Authorization') || '';
      if (!authorization.startsWith('Bearer ')) return reply({ error:'account-required' },401);
      const verified = await fetcher(url + '/auth/v1/user',{ headers:{ apikey:publicKey, Authorization:authorization } });
      if (!verified.ok) return reply({ error:'account-required' },401);
      const user = await verified.json();
      if (!user.id || !user.email_confirmed_at) return reply({ error:'verification-required' },403);
      const text = await request.text(); if (text.length > 20000) return reply({ error:'invalid-input' },400);
      let input;
      try { input = JSON.parse(text || '{}'); } catch { return reply({error:'invalid-input'},400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({error:'invalid-input'},400);
      if (input.action && (!/^[a-z0-9-]{8,150}$/i.test(input.commandId || ''))) return reply({ error:'invalid-input' },400);
      const moderator = moderators.includes(user.id);
      const communityEnabled = moderators.some((id) => /^[a-f0-9-]{36}$/i.test(id));
      for (let attempt = 0; attempt < 5; attempt++) {
        const rows = await database('dc_workspace?id=eq.1&select=revision,payload');
        const row = rows[0] || { revision:0, payload:emptyPlatform() };
        let state = addAccount(row.payload,user);
        if (input.action) {
          const duplicate = await database('dc_commands?actor_id=eq.' + encodeURIComponent(user.id) + '&command_id=eq.' + encodeURIComponent(input.commandId) + '&select=command_id');
          if (!duplicate.length) state = applyPlatformAction(state,input.action,user.id,{ moderator, communityEnabled });
        }
        if (state !== row.payload) {
          const committed = await database('rpc/dc_commit',{ p_revision:row.revision, p_payload:state, p_actor:user.id, p_command:input.action ? input.commandId : 'bootstrap' });
          if (!committed) continue;
          // A duplicate command may have won the race; return the committed state.
          const latest = await database('dc_workspace?id=eq.1&select=revision,payload');
          state = latest[0].payload; row.revision = latest[0].revision;
        }
        return reply({ protocol:1, revision:row.revision, state:projectPlatform(state,user.id,moderator,communityEnabled) });
      }
      return reply({ error:'conflict' },409);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'unavailable';
      const allowed = ['invalid-input','account-required','not-owner','not-found','conflict','event-not-open','moderator-required','no-evidence','blocked','group-required','private-contact','rate-limit','not-allowed'];
      return reply({ error:allowed.includes(code) ? code : 'unavailable' }, code === 'conflict' ? 409 : allowed.includes(code) ? 400 : 503);
    }
  };
}
