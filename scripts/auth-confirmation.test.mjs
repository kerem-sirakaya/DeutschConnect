import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseService} from '../src/services/supabase.js';
import {captureAuthCallback} from '../src/services/authCallback.js';

const config={url:'https://example.supabase.co',key:'sb_publishable_fixture'};
const key='deutschconnect.auth.example.supabase.co';
const now='2026-11-08T10:00:00Z';
function memory(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const token=id=>({access_token:id+'-access',refresh_token:id+'-refresh',expires_in:3600,expires_at:Date.now()/1000+3600});
const identity=id=>({id,email:id+'@test.invalid',email_confirmed_at:now});
const callback=id=>({pathname:'/',search:'',hash:'#access_token='+id+'-access&refresh_token='+id+'-refresh'});
const history=()=>({state:{dcIndex:3},replaceState(){}});

test('concurrent initialization callers wait for the same verification instead of seeing an unfinished login',async()=>{
  let release;const started=new Promise(resolve=>{release=resolve;});
  const client=createSupabaseService({config,storage:memory(),location:callback('b'),history:history(),fetcher:async()=>{await started;return Response.json(identity('b'));}});
  const first=client.initialize();let secondDone=false;const second=client.initialize().then(()=>{secondDone=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(secondDone,false);release();await Promise.all([first,second]);assert.equal(client.getUser().id,'b');
});

test('confirmation for another account never overwrites the existing verified account without an explicit choice',async()=>{
  const storage=memory();storage.setItem(key,JSON.stringify(token('a')));
  const client=createSupabaseService({config,storage,location:callback('b'),history:history(),fetcher:async(_url,options)=>Response.json(identity(options.headers.Authorization.includes('b-access')?'b':'a'))});
  await client.initialize();assert.equal(client.getUser().id,'a');assert.equal(JSON.parse(storage.getItem(key)).access_token,'a-access');
  assert.equal(client.getConfirmation().kind,'different-account');await client.acceptConfirmation();assert.equal(client.getUser().id,'b');assert.equal(JSON.parse(storage.getItem(key)).access_token,'b-access');
});

test('failed callback verification preserves the old session and can retry without URL tokens',async()=>{
  const storage=memory();storage.setItem(key,JSON.stringify(token('a')));let offline=true;
  const client=createSupabaseService({config,storage,location:callback('b'),history:history(),fetcher:async(_url,options)=>{if(offline)throw Error('offline');return Response.json(identity(options.headers.Authorization.includes('b-access')?'b':'a'));}});
  await assert.rejects(()=>client.initialize(),/network/);assert.equal(JSON.parse(storage.getItem(key)).access_token,'a-access');
  offline=false;await client.retryAuth();assert.equal(client.getUser().id,'a');assert.equal(client.getConfirmation().kind,'different-account');
});

test('incomplete callback credentials produce a safe error and retain a valid existing login',async()=>{
  const storage=memory();storage.setItem(key,JSON.stringify(token('a')));
  const client=createSupabaseService({config,storage,location:{...callback('b'),hash:'#access_token=incomplete'},history:history(),fetcher:async()=>Response.json(identity('a'))});
  await assert.rejects(()=>client.initialize(),/confirmation-link-invalid/);assert.equal(client.getUser().id,'a');
});

test('query callbacks are captured and sanitized before app routing without claiming login from a code alone',()=>{
  let replacement;const input={pathname:'/',search:'?code=private-code&lang=de',hash:''};
  const result=captureAuthCallback(input,{state:{dcIndex:4},replaceState:(...args)=>{replacement=args;}});
  assert.deepEqual(result,{kind:'error',code:'confirmation-password-required'});assert.equal(replacement[0].dcIndex,4);assert.equal(replacement[2],'/?lang=de#/me/account');assert.ok(!JSON.stringify(replacement).includes('private-code'));
});

test('a verified OTP response without a session confirms email only and leaves sign-in necessary',async()=>{
  const storage=memory();
  const client=createSupabaseService({config,storage,location:{pathname:'/',search:'?token_hash=private-hash&type=email',hash:''},history:history(),fetcher:async url=>{assert.ok(url.endsWith('/verify'));return Response.json({user:identity('b')});}});
  await client.initialize();assert.equal(client.getUser(),null);assert.equal(storage.values.size,0);assert.deepEqual(client.getConfirmation(),{kind:'confirmed',signedIn:false});
});

test('an expired or already used OTP preserves an existing account and reports a safe retryable explanation',async()=>{
  const storage=memory();storage.setItem(key,JSON.stringify(token('a')));
  const client=createSupabaseService({config,storage,location:{pathname:'/',search:'?token_hash=used-hash&type=email',hash:''},history:history(),fetcher:async url=>url.endsWith('/verify')?Response.json({error_code:'otp_expired'},{status:403}):Response.json(identity('a'))});
  await assert.rejects(()=>client.initialize(),/confirmation-link-expired/);
  assert.equal(client.getUser()?.id,'a');assert.equal(JSON.parse(storage.getItem(key)).access_token,'a-access');
  assert.deepEqual(client.getConfirmation(),{kind:'error',code:'confirmation-link-expired'});
});

test('an invalid callback session cannot replace a valid stored account',async()=>{
  const storage=memory();storage.setItem(key,JSON.stringify(token('a')));
  const client=createSupabaseService({config,storage,location:callback('b'),history:history(),fetcher:async(_url,options)=>options.headers.Authorization.includes('b-access')?Response.json({error:'invalid-token'},{status:401}):Response.json(identity('a'))});
  await assert.rejects(()=>client.initialize(),/confirmation-link-invalid/);assert.equal(client.getUser().id,'a');assert.equal(JSON.parse(storage.getItem(key)).access_token,'a-access');
});

test('retrying authentication preserves a verified memory-only account when persistent storage is blocked',async()=>{
  const storage={getItem:()=>null,setItem(){throw Error('blocked');},removeItem(){}};
  const client=createSupabaseService({config,storage,location:callback('a'),history:history(),fetcher:async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer a-access');
    return Response.json(url.endsWith('/platform')?{protocol:1,revision:0,state:{activeId:'a',profiles:{a:{id:'a'}}}}:identity('a'));
  }});
  await client.initialize();await client.retryAuth();assert.equal(client.getUser().id,'a');assert.equal((await client.platform()).state.activeId,'a');
});
