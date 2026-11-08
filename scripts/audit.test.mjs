import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseService } from '../src/services/supabase.js';
import { emptyPlatform, addAccount, applyPlatformAction as apply, projectPlatform } from '../supabase/functions/_shared/platform.js';
import { createGameRepository } from '../src/games/resultRepository.js';
import { pairsResult, arcadeResult } from '../src/games/leaderboards.js';
import { replay } from '../supabase/functions/_shared/chess.js';
import { displayedGroup } from '../src/data/groups.js';
import { groupFor } from '../supabase/functions/_shared/platform.js';
import { pageMemoryKey, readPageMemory } from '../src/state/pageMemory.js';
import { allowNavigation, setNavigationRisk } from '../src/state/navigationGuard.js';
import { submissionId } from '../src/state/pageMemory.js';

const config={url:'https://example.supabase.co',key:'sb_publishable_test'};
const authKey='deutschconnect.auth.example.supabase.co';
const now='2026-11-08T10:00:00Z';
function memory(){const values=new Map();return {values,getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:(key)=>values.delete(key)};}
const token={access_token:'test-a',refresh_token:'refresh-a',expires_in:3600};

test('retrying a community post after a lost response keeps one message across reloads',()=>{
  const storage=memory();let state=addAccount(emptyPlatform(),{id:'a',user_metadata:{displayName:'Student'}});
  state=apply(state,{type:'joinGroup',id:'general'},'a');
  const scope='community:room:general';
  const id=submissionId(storage,'a',scope,()=> 'local-retry-message');
  const action={type:'postMessage',id,roomId:'general',body:'A shared workshop update.'};
  state=apply(state,action,'a',{communityEnabled:true});
  const retriedId=submissionId(storage,'a',scope,()=> 'local-another-message');
  assert.equal(retriedId,id);
  assert.equal(apply(state,{...action,id:retriedId},'a',{communityEnabled:true}),state);
  assert.equal(state.modules.messages.length,1);
  assert.throws(()=>apply(state,{...action,body:'An altered message using the same ID.'},'a',{communityEnabled:true}));
});

test('unrelated demo/game storage events must not interrupt authentication or reverify a user',async()=>{
  const storage=memory();let requests=0;
  const client=createSupabaseService({config,storage,fetcher:async(url)=>{requests++;return Response.json(url.includes('/token?')?token:{id:'a',email_confirmed_at:now});}});
  await client.signIn('a@example.org','test-password');const before=requests;
  await client.synchronize({type:'storage',key:'deutschconnect.game-results.v1:demo'});
  assert.equal(requests,before);assert.equal(client.getUser().id,'a');
});

test('a changed session that fails verification cannot keep the previous account identity visible',async()=>{
  const storage=memory();let invalid=false;
  const client=createSupabaseService({config,storage,fetcher:async(url)=>url.includes('/token?')?Response.json(token):invalid?Response.json({error:'invalid-token'},{status:401}):Response.json({id:'a',email_confirmed_at:now})});
  await client.signIn('a@example.org','test-password');invalid=true;
  storage.setItem(authKey,JSON.stringify({...token,access_token:'different-token',expires_at:Date.now()/1000+3600}));
  await assert.rejects(()=>client.synchronize({type:'storage',key:authKey}));
  assert.equal(client.getUser(),null);
});

test('a valid memory-only session survives reconnecting when storage writes are blocked',async()=>{
  const storage={getItem:()=>null,setItem(){throw new Error('quota');},removeItem(){}};
  const client=createSupabaseService({config,storage,fetcher:async(url)=>Response.json(url.includes('/token?')?token:{id:'a',email_confirmed_at:now})});
  await client.signIn('a@example.org','test-password');await client.synchronize({type:'online'});
  assert.equal(client.getUser()?.id,'a');
});

test('an idempotent game save must publish the latest snapshot to a stale tab',async()=>{
  const storage=memory(),locks={request:async(_name,work)=>work()};
  const first=createGameRepository({storage,locks,scope:'demo',profileIds:['a']});
  const second=createGameRepository({storage,locks,scope:'demo',profileIds:['a']});
  const result={id:'run-a',ownerId:'a',game:'runner',score:20,completed:true,completedAt:now};
  await second.write({type:'record',result},'a');
  assert.equal(await first.write({type:'record',result},'a'),true);
  assert.equal(first.getSnapshot().data.results.length,1);
});

test('malformed local game states are rejected without crashing result calculation',()=>{
  for(const deck of [null,undefined,{},'bad'])assert.doesNotThrow(()=>assert.equal(pairsResult(deck,[],6,'run-a','a'),null));
  for(const found of [null,undefined,{}])assert.doesNotThrow(()=>assert.equal(pairsResult([0,0,1,1,2,2,3,3,4,4,5,5],found,6,'run-a','a'),null));
  for(const scene of [null,undefined,{}])assert.doesNotThrow(()=>assert.equal(arcadeResult('runner',scene,'run-a','a'),null));
});

test('chess replay refuses legal-looking moves after an automatic draw',()=>{
  const cycle=['g1f3','g8f6','f3g1','f6g8'];
  assert.throws(()=>replay([...cycle,...cycle,...cycle,...cycle,'g1f3','g8h6']));
});

test('private project membership must not leak profile IDs into an unrelated account snapshot',()=>{
  let state=emptyPlatform();for(const id of ['a','b','c']){state=addAccount(state,{id,user_metadata:{displayName:'Student '+id}});state=apply(state,{type:'preferences',patch:{schoolId:'ers'}},id);}
  state=apply(state,{type:'submitIdea',id:'local-project',idea:{title:'Shared science project',description:'We build a shared school science project together.',category:'science'}},'a');
  state=apply(state,{type:'requestIdea',id:'local-project'},'b');state=apply(state,{type:'reviewIdeaRequest',id:'local-project',profileId:'b',decision:'accept'},'a');
  assert.equal(projectPlatform(state,'a').profiles.b.displayName,'Student b');
  assert.equal(projectPlatform(state,'c').profiles.b,undefined);
});

test('an account event roster uses authorized group members instead of private participation data',()=>{
  let state=emptyPlatform();for(const id of ['a','b','c','d'])state=addAccount(state,{id,user_metadata:{displayName:'Student '+id}});
  state=apply(state,{type:'createEvent',id:'local-event',event:{title:'Joint school workshop',description:'A shared workshop for students from two schools.',hostSchoolId:'ers',category:'science',startsAt:'2090-01-01T09:00:00Z'}},'a');
  state=apply(state,{type:'approveEvent',eventId:'local-event'},'d',{moderator:true});
  state=apply(state,{type:'createEventGroup',eventId:'local-event'},'a');
  for(const id of ['b','c'])state=apply(state,{type:'participation',eventId:'local-event',status:'joined'},id);
  const view=projectPlatform(state,'b');assert.deepEqual(Object.keys(view.participation),['b']);
  assert.ok(!groupFor(view,'event-local-event').memberIds.includes('c'),'reconstruction from the partial snapshot loses another authorized member');
  assert.deepEqual(displayedGroup(view,'event-local-event','account').memberIds,['a','b','c']);
  assert.deepEqual(displayedGroup(projectPlatform(state,'d'),'event-local-event','account').memberIds,[],'a non-member gets no roster');
});

test('corrupt null draft fields are not restored as objects, and the original draft is preserved',()=>{
  const storage=memory(),key=pageMemoryKey('a','draft:idea:new');
  const raw=JSON.stringify({title:'My unfinished idea',expectedRecord:{revision:123}});storage.setItem(key,raw);
  const restored=readPageMemory(storage,'a','draft:idea:new',{title:'',expectedRecord:null});
  assert.equal(restored.available,false);assert.equal(restored.value.expectedRecord,null);assert.equal(storage.getItem(key),raw);
});

test('unsaved game-result risk protects navigation until the save completes',()=>{
  const token=Symbol('pending-game-result');let confirmations=0;
  try{
    setNavigationRisk(token,true);assert.equal(allowNavigation(()=>{confirmations++;return false;}),false);
    assert.equal(confirmations,1);setNavigationRisk(token,false);
    assert.equal(allowNavigation(()=>{throw new Error('saved result must not prompt');}),true);
  }finally{setNavigationRisk(token,false);}
});

test('refreshing credentials for the same account never emits a temporary sign-out',async()=>{
  const storage=memory(),seen=[];
  const client=createSupabaseService({config,storage,fetcher:async(url)=>Response.json(url.includes('/token?')?token:{id:'a',email_confirmed_at:now})});
  await client.signIn('a@example.org','test-password');client.subscribe(()=>seen.push(client.getUser()?.id));
  storage.setItem(authKey,JSON.stringify({...token,access_token:'rotated-a',expires_at:Date.now()/1000+3600}));
  await client.synchronize({type:'storage',key:authKey});assert.deepEqual(seen,['a']);
});

test('online events during a pending login do not cancel that login',async()=>{
  const storage=memory();let release,started;
  const ready=new Promise((resolve)=>started=resolve);
  const client=createSupabaseService({config,storage,fetcher:async(url)=>{
    if(url.includes('/token?')){started();return new Promise((resolve)=>release=()=>resolve(Response.json(token)));}
    return Response.json({id:'a',email_confirmed_at:now});
  }});
  const login=client.signIn('a@example.org','test-password');await ready;
  await client.synchronize({type:'online'});release();await login;
  assert.equal(client.getUser().id,'a');
});

test('auth callbacks remove URL credentials without losing existing history position',async()=>{
  const replacements=[],storage=memory();
  const client=createSupabaseService({config,storage,location:{pathname:'/',search:'',hash:'#access_token=fake-access&refresh_token=fake-refresh'},history:{state:{dcIndex:4,dcPrevious:'/ideas/all'},replaceState:(...args)=>replacements.push(args)},fetcher:async()=>Response.json({id:'a',email_confirmed_at:now})});
  await client.initialize();
  assert.equal(replacements[0][0].dcIndex,4);assert.equal(replacements[0][0].dcRoute,'/me/account');
  assert.ok(!JSON.stringify(replacements).includes('fake-access'));
});
