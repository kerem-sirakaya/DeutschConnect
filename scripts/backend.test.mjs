import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlatform, addAccount, applyPlatformAction as apply, projectPlatform, groupFor } from '../supabase/functions/_shared/platform.js';
import { createSupabaseService, readBackendConfig } from '../src/services/supabase.js';
const now='2026-11-07T12:00:00Z';
function base() { let s=emptyPlatform(); for(const [id,schoolId]of[['a','ers'],['b','anka'],['c','ers']]) { s=addAccount(s,{id,user_metadata:{displayName:'Student '+id}},now); s=apply(s,{type:'preferences',patch:{schoolId}},id); } return s; }
const idea={title:'A joint school project',description:'Students from both schools build a shared science project.',category:'science'};
const tutor={kind:'offer',subject:'Mathematik',topics:'Linear equations',description:'We work through examples and learn the mathematical steps together.',availability:'After school',languages:['de'],format:'online'};
test('real accounts start with no fictional events, projects, achievements or profiles',()=>{
 const s=base(); assert.equal(s.activities.length,0); assert.equal(s.ideas.length,0); assert.equal(s.modules.awards.length,0); assert.equal(s.modules.games.length,0); assert.equal(s.modules.groups.length,4); assert.ok(!s.profiles.alex);
 assert.throws(()=>apply(s,{type:'preferences',patch:{isModerator:true}},'a'));
 assert.throws(()=>apply(s,{type:'preferences',patch:{displayName:'X'}},'a'));
 assert.throws(()=>apply(s,{type:'preferences',patch:{displayName:'Someone'}},'outsider'));
});
test('server ignores forged authors, enforces ownership and checks edit revisions',()=>{
 let s=apply(base(),{type:'submitIdea',id:'local-project',idea:{...idea,ownerId:'b'}},'a'); assert.equal(s.ideas[0].ownerId,'a');
 assert.throws(()=>apply(s,{type:'removeIdea',id:'local-project'},'b'),/not-owner/);
 const expectedRecord=JSON.stringify(s.ideas[0]); s=apply(s,{type:'updateIdea',id:'local-project',idea:{...idea,title:'Updated joint project'},expectedRecord},'a');
 assert.throws(()=>apply(s,{type:'updateIdea',id:'local-project',idea,expectedRecord},'a'),/conflict/);
 s=apply(s,{type:'submitTutoring',id:'local-tutor',record:{...tutor,ownerId:'b'}},'a'); assert.equal(s.modules.tutoring[0].ownerId,'a');
 assert.throws(()=>apply(s,{type:'closeTutoring',id:'local-tutor'},'b'),/not-owner/);
});
test('private groups inherit approved membership and reject non-members or absent moderation',()=>{
 let s=apply(base(),{type:'submitIdea',id:'local-project',idea},'a'); s=apply(s,{type:'createProjectGroup',ideaId:'local-project'},'a');
 assert.throws(()=>apply(s,{type:'postMessage',id:'local-post',roomId:'project-local-project',body:'A private group message.'},'b',{communityEnabled:true}),/group-required/);
 s=apply(s,{type:'requestIdea',id:'local-project'},'b'); assert.equal(groupFor(s,'project-local-project').memberIds.length,1);
 s=apply(s,{type:'reviewIdeaRequest',id:'local-project',profileId:'b',decision:'accept'},'a'); assert.ok(groupFor(s,'project-local-project').memberIds.includes('b'));
 assert.throws(()=>apply(s,{type:'postMessage',id:'local-post',roomId:'project-local-project',body:'A private group message.'},'b'),/moderation-required/);
 s=apply(s,{type:'postMessage',id:'local-post',roomId:'project-local-project',body:'A private group message.'},'b',{communityEnabled:true,now});
 assert.equal(projectPlatform(s,'c').modules.messages.length,0); assert.equal(projectPlatform(s,'a').modules.messages.length,1);
 s=apply(s,{type:'leaveIdea',id:'local-project'},'b'); assert.equal(projectPlatform(s,'b').modules.messages.length,0);
});
test('message limits, private contact protection, deletion and reports are enforced on the server',()=>{
 let s=apply(base(),{type:'joinGroup',id:'general'},'a'); s=apply(s,{type:'joinGroup',id:'general'},'b');
 for(const body of ['Write to person@example.org','Call +90 555 123 45 67','Visit https://example.org']) assert.throws(()=>apply(s,{type:'postMessage',id:'local-private',roomId:'general',body},'a',{communityEnabled:true,now}),/private-contact/);
 for(let i=0;i<10;i++) s=apply(s,{type:'postMessage',id:'local-post-'+i,roomId:'general',body:'A useful question for the group.'},'a',{communityEnabled:true,now});
 assert.throws(()=>apply(s,{type:'postMessage',id:'local-excess',roomId:'general',body:'Too many posts in the minute.'},'a',{communityEnabled:true,now}),/rate-limit/);
 assert.throws(()=>apply(s,{type:'removeMessage',id:'local-post-0'},'b'),/not-owner/);
 s=apply(s,{type:'report',targetType:'message',targetId:'local-post-0',reason:'spam'},'b');
 assert.equal(projectPlatform(s,'a').modules.reports.length,0); assert.equal(projectPlatform(s,'b').modules.reports.length,1);
 assert.throws(()=>apply(s,{type:'moderateMessage',id:'local-post-0'},'b'),/not-owner/);
 s=apply(s,{type:'moderateMessage',id:'local-post-0'},'c',{moderator:true}); assert.equal(s.modules.messages.length,9);
});
test('blocking stops challenges and hides listings, profiles and posts in the projection',()=>{
 let s=base(); s=apply(s,{type:'setCommunityVisibility',visible:true},'a'); s=apply(s,{type:'setCommunityVisibility',visible:true},'b');
 s=apply(s,{type:'submitTutoring',id:'local-tutor',record:tutor},'b'); s=apply(s,{type:'blockPerson',profileId:'b',blocked:true},'a');
 assert.throws(()=>apply(s,{type:'challengeChess',id:'local-challenge',profileId:'a'},'b'));
 const projection=projectPlatform(s,'a'); assert.equal(projection.modules.tutoring.length,0); assert.ok(!projection.profiles.b);
 assert.deepEqual(projection.modules.blocks,{a:['b']});
});
test('real event registration requires approval; attendance and awards require moderator evidence',()=>{
 let s=base(); const event={title:'A future workshop',description:'Students from two schools attend a genuine workshop.',hostSchoolId:'ers',category:'science',startsAt:'2026-11-08T10:00:00Z'};
 s=apply(s,{type:'createEvent',id:'local-event',event},'a',{now}); assert.equal(s.activities[0].approval,'proposal');
 assert.throws(()=>apply(s,{type:'participation',eventId:'local-event',status:'joined'},'b'),/event-not-open/);
 assert.throws(()=>apply(s,{type:'approveEvent',eventId:'local-event'},'a'),/moderator-required/);
 s=apply(s,{type:'approveEvent',eventId:'local-event'},'c',{moderator:true});
 for(const actor of ['a','b']) s=apply(s,{type:'participation',eventId:'local-event',status:'joined'},actor);
 assert.throws(()=>apply(s,{type:'confirmAttendance',eventId:'local-event',profileId:'b'},'c',{moderator:true,now}),/no-evidence/);
 for(const profileId of ['a','b']) s=apply(s,{type:'confirmAttendance',eventId:'local-event',profileId},'c',{moderator:true,now:'2026-11-09T12:00:00Z'});
 s=apply(s,{type:'awardRecognition',eventId:'local-event',profileId:'b'},'c',{moderator:true});
 assert.equal(s.modules.awards.length,1); assert.equal(projectPlatform(s,'a').modules.awards.length,0); assert.equal(projectPlatform(s,'b').modules.awards.length,1);
 assert.deepEqual(Object.keys(projectPlatform(s,'b').activities[0].attendance),['b']);
 s=apply(s,{type:'shareAwards',shared:true},'b'); assert.equal(projectPlatform(s,'a').modules.awards.length,1);
});
test('unshared and unrelated profiles and private contact drafts are not exposed',()=>{
 let s=base(); s=apply(s,{type:'submitTutoring',id:'local-tutor',record:tutor},'a');
 s=apply(s,{type:'saveContactDraft',targetId:'local-tutor',note:'A private request draft for later.'},'b');
 const view=projectPlatform(s,'a'); assert.ok(!view.profiles.c); assert.equal(view.modules.contactDrafts.length,0); assert.deepEqual(Object.keys(view.participation),['a']);
});
test('event group membership follows real registration and is removed after withdrawal',()=>{
 let s=apply(base(),{type:'createEvent',id:'local-event',event:{title:'Joint school workshop',description:'Students work on a school project during a workshop.',hostSchoolId:'ers',category:'science',startsAt:'2026-11-08T10:00:00Z'}},'a',{now});
 assert.throws(()=>apply(s,{type:'createEventGroup',eventId:'local-event'},'a'));
 s=apply(s,{type:'approveEvent',eventId:'local-event'},'c',{moderator:true});s=apply(s,{type:'createEventGroup',eventId:'local-event'},'a');
 assert.equal(groupFor(s,'event-local-event').memberIds.includes('b'),false);
 s=apply(s,{type:'participation',eventId:'local-event',status:'joined'},'b');assert.equal(groupFor(s,'event-local-event').memberIds.includes('b'),true);
 s=apply(s,{type:'participation',eventId:'local-event',status:null},'b');assert.equal(groupFor(s,'event-local-event').memberIds.includes('b'),false);
});

const config={url:'https://example.supabase.co',key:'sb_publishable_test'};
function memory(){const m=new Map();return{getItem:(k)=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:(k)=>m.delete(k),values:m};}
test('backend configuration rejects secret keys and insecure remote URLs',()=>{
 assert.equal(readBackendConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_bad'}),null);
 assert.equal(readBackendConfig({VITE_SUPABASE_URL:'http://example.org',VITE_SUPABASE_PUBLISHABLE_KEY:config.key}),null);
 assert.deepEqual(readBackendConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:config.key}),config);
});
test('public profile and listing fields reject private contact data without blocking ordinary dates',()=>{
 let s=base();assert.throws(()=>apply(s,{type:'preferences',patch:{displayName:'person@example.org'}},'a'),/private-contact/);
 assert.throws(()=>apply(s,{type:'submitIdea',id:'local-contact',idea:{...idea,description:'Contact me at person@example.org to join this project.'}},'a'),/private-contact/);
 assert.throws(()=>apply(s,{type:'submitTutoring',id:'local-contact',record:{...tutor,availability:'Call +90 555 123 45 67'}},'a'),/private-contact/);
 s=apply(s,{type:'joinGroup',id:'general'},'a');
 assert.doesNotThrow(()=>apply(s,{type:'postMessage',id:'local-date',roomId:'general',body:'Let us meet on 2026-11-09 in the group.'},'a',{communityEnabled:true}));
});
test('signup never implies verification and passwords are never persisted',async()=>{
 const storage=memory(),calls=[]; const client=createSupabaseService({config,storage,fetcher:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({id:'a'});}});
 await client.signUp('student@example.org','a-long-test-password','Student','de'); assert.equal(client.getUser(),null); assert.equal(storage.values.size,0); assert.equal(calls[0].body.password,'a-long-test-password');
});

test('signup and resend retain the current frontend callback instead of falling back to another site',async()=>{
 const calls=[],storage=memory();
 const client=createSupabaseService({config,storage,location:{origin:'http://127.0.0.1:5173',pathname:'/app/',hash:'#/me/account'},fetcher:async(url,init)=>{calls.push({url:new URL(url),body:JSON.parse(init.body)});return Response.json({});}});
 await client.signUp('student@example.org','a-long-test-password','Student','de');
 await client.resend('student@example.org');
 assert.deepEqual(calls.map(({url})=>url.pathname),['/auth/v1/signup','/auth/v1/resend']);
 for(const {url} of calls)assert.equal(url.searchParams.get('redirect_to'),'http://127.0.0.1:5173/app/');
 assert.deepEqual(calls[1].body,{type:'signup',email:'student@example.org'});
 assert.equal(client.getUser(),null);assert.equal(storage.values.size,0);
});

test('confirmation removes URL tokens, verifies the user and restores the session after reload',async()=>{
 const storage=memory(),replacements=[];let verifications=0;
 const fetcher=async(url)=>{assert.ok(url.endsWith('/user'));verifications++;return Response.json({id:'a',email:'student@example.org',email_confirmed_at:now});};
 const client=createSupabaseService({config,storage,fetcher,location:{pathname:'/',search:'',hash:'#access_token=test-access&refresh_token=test-refresh&expires_in=3600'},history:{replaceState:(...args)=>replacements.push(args)}});
 await client.initialize();assert.equal(client.getUser().id,'a');
 assert.equal(replacements[0][2],'/#/me/account');assert.ok(!replacements[0][2].includes('test-access'));
 const restored=createSupabaseService({config,storage,fetcher,location:{pathname:'/',search:'',hash:'#/me'}});
 await restored.initialize();assert.equal(restored.getUser().id,'a');assert.equal(verifications,2);
});

test('expired and invalid confirmation callbacks return to the account page with safe error codes',async()=>{
 for(const [hash,code] of [
 ['#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=','confirmation-link-expired'],
 ['#error=access_denied&error_description=%3Cscript%3Euntrusted%3C%2Fscript%3E','confirmation-link-invalid']
 ]){
  const storage=memory(),replacements=[];
  const client=createSupabaseService({config,storage,location:{pathname:'/',search:'',hash},history:{replaceState:(...args)=>replacements.push(args)},fetcher:async()=>{throw new Error('No auth call expected without a session');}});
  await assert.rejects(()=>client.initialize(),(error)=>error.message===code);
  assert.equal(replacements[0][2],'/#/me/account');assert.equal(client.getUser(),null);assert.equal(storage.values.size,0);
 }
});

test('a reused confirmation link does not erase an existing server-verified session',async()=>{
 const storage=memory();
 const fetcher=async(url)=>url.includes('/token?')?Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}):Response.json({id:'a',email_confirmed_at:now});
 const signedIn=createSupabaseService({config,storage,fetcher});await signedIn.signIn('student@example.org','a-long-test-password');
 const original=[...storage.values.values()];
 const restored=createSupabaseService({config,storage,fetcher,location:{pathname:'/',search:'',hash:'#error=access_denied&error_code=otp_expired'},history:{replaceState(){}}});
 await assert.rejects(()=>restored.initialize(),/confirmation-link-expired/);
 assert.equal(restored.getUser().id,'a');assert.deepEqual([...storage.values.values()],original);
});
test('login verifies identity, platform errors are preserved and logout clears stored sessions',async()=>{
 const storage=memory(); let failPlatform=false;
 const fetcher=async(url,init)=>{
 if(url.includes('/token?'))return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
 if(url.endsWith('/user'))return Response.json({id:'a',email:'private@example.org',email_confirmed_at:now});
 if(url.endsWith('/logout'))return Response.json({});
 if(failPlatform)return Response.json({error:'conflict'},{status:409});
 const state=base();state.activeId='a';return Response.json({protocol:1,revision:1,state:projectPlatform(state,'a')});
 };
 const client=createSupabaseService({config,storage,fetcher}); await client.signIn('private@example.org','a-long-test-password'); assert.equal(client.getUser().id,'a'); assert.ok(![...storage.values.values()][0].includes('password'));
 assert.equal((await client.platform()).state.activeId,'a'); failPlatform=true; await assert.rejects(()=>client.platform({type:'preferences'},'test-command'),/conflict/);
 await client.signOut(); assert.equal(client.getUser(),null); assert.equal(storage.values.size,0);
});
test('an account change during refresh cannot execute an old command as another account',async()=>{
 const storage=memory(); let identity='a',platformCalls=0;
 const client=createSupabaseService({config,storage,fetcher:async(url)=>{
 if(url.includes('/token?'))return Response.json({access_token:'test',refresh_token:'refresh',expires_in:3600});
 if(url.endsWith('/user'))return Response.json({id:identity,email_confirmed_at:now});
 platformCalls++;return Response.json({});
 }});
 await client.signIn('a@example.org','a-long-test-password'); identity='b'; await assert.rejects(()=>client.platform({type:'removeIdea',id:'local-project'},'test-command'),/account-required/); assert.equal(platformCalls,0);
});
test('a delayed login verification cannot revive a signed-out session',async()=>{
 const storage=memory();let release,requested;const started=new Promise((resolve)=>requested=resolve);
 const client=createSupabaseService({config,storage,fetcher:async(url)=>{
 if(url.includes('/token?'))return Response.json({access_token:'test',refresh_token:'refresh',expires_in:3600});
 if(url.endsWith('/user')){if(!release){requested();return new Promise((resolve)=>release=()=>resolve(Response.json({id:'a',email_confirmed_at:now})));}return Response.json({id:'a',email_confirmed_at:now});}
 return Response.json({});
 }});
 const login=client.signIn('a@example.org','a-long-test-password');await started;await client.signOut();release();await assert.rejects(()=>login,/account-required/);assert.equal(client.getUser(),null);assert.equal(storage.values.size,0);
});
test('contextual names and blocked pending requests preserve privacy without breaking owner views',()=>{
 let s=apply(base(),{type:'submitIdea',id:'local-project',idea},'a');s=apply(s,{type:'requestIdea',id:'local-project'},'b');
 assert.equal(projectPlatform(s,'a').profiles.b.displayName,'Student b');assert.equal(projectPlatform(s,'a').modules.visibility.b,false);
 s=apply(s,{type:'blockPerson',profileId:'b',blocked:true},'a');const view=projectPlatform(s,'a');assert.equal(view.ideas[0].requestedIds.length,0);assert.ok(!view.profiles.b);
});
