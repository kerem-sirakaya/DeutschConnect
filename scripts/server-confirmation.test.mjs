import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseService} from '../src/services/supabase.js';

test('an invalid server revision cannot be acknowledged as a successful saved action',async()=>{
  let revision;
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const client=createSupabaseService({config:{url:'https://test.invalid',key:'sb_publishable_fixture'},storage,
    fetcher:async(url)=>Response.json(url.includes('/token?')?{access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600}:url.endsWith('/user')?{id:'a',email_confirmed_at:'2026-01-01'}:{protocol:1,revision,state:{activeId:'a',profiles:{a:{id:'a'}}}})});
  await client.signIn('a@test.invalid','fictional-password');
  for(const invalid of [undefined,null,-1,'2',1.5]){
    revision=invalid;
    await assert.rejects(()=>client.platform({type:'preferences'},'fixture-command'),/invalid-response/);
  }
  revision=2;assert.equal((await client.platform()).revision,2);
});

test('a revoked account session is cleared when a normal platform poll receives unauthorized',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let revoked=false;
  const client=createSupabaseService({config:{url:'https://test.invalid',key:'sb_publishable_fixture'},storage,
    fetcher:async(url)=>url.includes('/token?')?Response.json({access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600}):url.endsWith('/user')?revoked?Response.json({error:'invalid-token'},{status:401}):Response.json({id:'a',email_confirmed_at:'2026-01-01'}):Response.json({protocol:1,revision:1,state:{activeId:'a',profiles:{a:{id:'a'}}}})});
  await client.signIn('a@test.invalid','fictional-password');revoked=true;
  await assert.rejects(()=>client.platform(),/invalid-token/);
  assert.equal(client.getUser(),null);assert.equal(values.size,0);
});
