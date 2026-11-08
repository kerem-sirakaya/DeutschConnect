import test from 'node:test';
import assert from 'node:assert/strict';
import { addAccount, emptyPlatform, applyPlatformAction as apply, projectPlatform } from '../supabase/functions/_shared/platform.js';
import { publicProfile } from '../supabase/functions/_shared/profiles.js';
import { selectPersonalArea } from '../src/data/personalArea.js';
import { selectPublicProfile } from '../src/data/profiles.js';
import { createDemoState, demoReducer, inspectDemoState } from '../src/data/demoState.js';
import { safeReturnTo } from '../src/data/navigation.js';

const now = '2026-11-08T09:00:00Z';
const idea = {title:'Shared science project',description:'Students organize a shared science project together.',category:'science'};
function base() {
  let state = emptyPlatform();
  for (const [id,schoolId] of [['a','ers'],['b','anka'],['c','ers']]) {
    state = addAccount(state,{id,user_metadata:{displayName:'Student '+id}},now);
    state = apply(state,{type:'preferences',patch:{schoolId,interests:['science'],customInterests:['Robotics']}},id);
  }
  return state;
}
const share = (s,id,profileSharing) => apply(apply(s,{type:'preferences',patch:{profileSharing}},id),{type:'setCommunityVisibility',visible:true},id);

test('new and legacy accounts expose no optional profile fields until individual opt-in',()=>{
  let s=base(); assert.equal(publicProfile(s,'b'),null);
  s=apply(s,{type:'setCommunityVisibility',visible:true},'b');
  let view=projectPlatform(s,'a');
  assert.equal(view.profiles.b.schoolId,''); assert.deepEqual(view.profiles.b.interests,[]);
  assert.equal(view.modules.publicProfiles.b.schoolId,''); assert.deepEqual(view.modules.publicProfiles.b.ownedProjectIds,[]);
  s=share(s,'b',{school:true}); view=projectPlatform(s,'a');
  assert.equal(view.modules.publicProfiles.b.schoolId,'anka'); assert.deepEqual(view.modules.publicProfiles.b.interests,[]);
  s=share(s,'b',{interests:true}); view=projectPlatform(s,'a');
  assert.equal(view.modules.publicProfiles.b.schoolId,''); assert.deepEqual(view.modules.publicProfiles.b.interests,['science','Robotics']);
  assert.throws(()=>apply(s,{type:'preferences',patch:{profileSharing:{email:true}}},'b'));
  assert.throws(()=>apply(s,{type:'preferences',patch:{profileSharing:{school:'yes'}}},'b'));
});

test('profile activities use authorship and accepted membership, never recommendations or requests',()=>{
  let s=share(base(),'b',{projects:true});
  s=apply(s,{type:'submitIdea',id:'local-science',idea},'a');
  assert.deepEqual(publicProfile(s,'b').currentProjectIds,[]);
  s=apply(s,{type:'setIdeaInterest',id:'local-science',interested:true},'b');
  s=apply(s,{type:'requestIdea',id:'local-science'},'b');
  assert.equal(publicProfile(s,'b').counts.projectMemberships,0);
  s=apply(s,{type:'reviewIdeaRequest',id:'local-science',profileId:'b',decision:'accept'},'a');
  assert.deepEqual(publicProfile(s,'b').currentProjectIds,['local-science']);
  assert.deepEqual(projectPlatform(s,'c').ideas[0].participantIds,['b']);
  s=share(s,'b',{}); const view=projectPlatform(s,'c');
  assert.deepEqual(view.ideas[0].participantIds,[]); assert.deepEqual(view.modules.publicProfiles.b.currentProjectIds,[]);
  assert.deepEqual(projectPlatform(s,'b').ideas[0].participantIds,['b'],'own membership stays available');
});

test('only moderation can confirm completion and freeze actual accepted participants',()=>{
  let s=apply(base(),{type:'submitIdea',id:'local-science',idea:{...idea,completion:{confirmedBy:'a'}}},'a');
  assert.equal(s.ideas[0].completion,undefined);
  for (const id of ['b','c']) s=apply(s,{type:'requestIdea',id:'local-science'},id);
  s=apply(s,{type:'reviewIdeaRequest',id:'local-science',profileId:'b',decision:'accept'},'a');
  assert.throws(()=>apply(s,{type:'confirmProjectCompletion',id:'local-science'},'a'),/moderator-required/);
  s=apply(s,{type:'confirmProjectCompletion',id:'local-science'},'c',{moderator:true,now});
  const model=(id)=>selectPersonalArea(projectPlatform(s,id),id,new Date(now));
  assert.equal(model('a').counts.completedProjects,1); assert.equal(model('b').counts.completedProjects,1);
  assert.equal(model('c').counts.completedProjects,0); assert.equal(model('b').counts.activeProjects,0);
  assert.equal(model('c').counts.projectRequests,0,'completed projects have no pending join requests');
  assert.throws(()=>apply(s,{type:'reviewIdeaRequest',id:'local-science',profileId:'c',decision:'accept'},'a'));
  assert.throws(()=>apply(s,{type:'requestIdea',id:'local-science'},'c'));
  s=apply(s,{type:'leaveIdea',id:'local-science'},'b');
  assert.equal(model('b').counts.completedProjects,1,'later departure preserves the confirmed historical membership');
});

test('attendance, past registrations and cancelled events produce different counts',()=>{
  const s=base();
  s.activities=[
    {id:'past',startsAt:'2026-11-01T09:00:00Z',approval:'confirmed',attendance:{}},
    {id:'future',startsAt:'2026-12-01T09:00:00Z',approval:'confirmed',attendance:{}},
    {id:'attended',startsAt:'2026-11-01T09:00:00Z',approval:'confirmed',attendance:{a:{confirmedBy:'c',confirmedAt:now}}},
    {id:'fake',startsAt:'2026-11-01T09:00:00Z',approval:'confirmed',attendance:{a:true}},
    {id:'cancelled',startsAt:'2026-12-01T09:00:00Z',cancelled:true,approval:'confirmed',attendance:{}}
  ]; s.participation.a={past:'joined',future:'joined',attended:'joined',fake:'interested',cancelled:'joined'};
  s.activities.push({id:'own-proposal',ownerId:'a',startsAt:'2026-12-02T09:00:00Z',approval:'proposal',attendance:{}});
  const model=selectPersonalArea(s,'a',new Date(now));
  assert.equal(model.counts.eventRegistrations,4); assert.equal(model.counts.upcomingRegistrations,1);
  assert.equal(model.counts.confirmedAttendance,1); assert.equal(model.confirmedAttendance[0].id,'attended');
  assert.deepEqual(model.events.organized.map((event)=>event.id),['own-proposal'],'own proposals stay manageable without becoming registrations');
});

test('profile withdrawal and blocking remove shared activities and awards from server output',()=>{
  let s=share(base(),'b',{projects:true,interests:true});
  s=apply(s,{type:'submitIdea',id:'local-science',idea},'b');
  s.modules.awards=[{id:'award-1',ownerId:'b',kind:'collaboration',awardedAt:now,eventId:'private-event',awardedBy:'c'}];
  s=apply(s,{type:'shareAwards',shared:true},'b');
  let view=projectPlatform(s,'a'); assert.equal(view.modules.publicProfiles.b.awards.length,1);
  assert.ok(!JSON.stringify(view.modules.awards).includes('private-event'));
  s=apply(s,{type:'setCommunityVisibility',visible:false},'b'); view=projectPlatform(s,'a');
  assert.equal(view.modules.publicProfiles.b,undefined); assert.equal(view.modules.awards.length,0);
  assert.equal(view.ideas[0].schoolId,'');
  s=apply(s,{type:'blockPerson',profileId:'b',blocked:true},'a'); view=projectPlatform(s,'a');
  assert.equal(view.modules.publicProfiles.b,undefined); assert.equal(view.ideas.length,0);
});

test('demo sharing persists without promoting browser claims to verified achievements',()=>{
  let s=demoReducer(createDemoState(),{type:'preferences',actorId:'deniz',patch:{profileSharing:{interests:true,school:true,projects:true}}});
  s.ideas[0].completion={confirmedBy:'alex',confirmedAt:now,memberIds:['deniz']};
  s=inspectDemoState(JSON.stringify(s)).state;
  assert.equal(s.profiles.deniz.profileSharing.interests,true);
  assert.equal(selectPublicProfile(s,'deniz').schoolId,'anka');
  assert.equal(selectPersonalArea(s,'deniz').counts.completedProjects,0);
});

test('older server payloads cannot activate extended public profile fields in the new client',()=>{
  const s=apply(base(),{type:'setCommunityVisibility',visible:true},'b');
  const view=projectPlatform(s,'a'); delete view.modules.profileCapabilities;
  view.profiles.b.schoolId='anka'; view.profiles.b.interests=['science'];
  assert.equal(selectPublicProfile(view,'b').schoolId,''); assert.deepEqual(selectPublicProfile(view,'b').interests,[]);
});

test('contextual returns allow internal lists, profiles and detail views but reject external and nested redirects',()=>{
  for (const path of ['/','/ideas/local-science','/community/people/b','/community/rooms/project-local-science','/me/projects?view=completed','/discover/interviews']) assert.equal(safeReturnTo(path),path);
  for (const path of ['https://example.org','//example.org','/ideas/a?from=%2Fme','/../me','/me#other','/me?token=secret']) assert.equal(safeReturnTo(path),undefined);
});
