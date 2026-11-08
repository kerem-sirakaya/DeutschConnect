import test from 'node:test';
import assert from 'node:assert/strict';
import { chessInvitationEvents as notices, chessInviteEmail } from '../supabase/functions/_shared/chessInvitations.js';
import { emptyPlatform, addAccount, applyPlatformAction as apply, projectPlatform } from '../supabase/functions/_shared/platform.js';
import { createDemoState, demoReducer, inspectDemoState } from '../src/data/demoState.js';

function base(){let s=emptyPlatform();for(const id of ['a','b','c'])s=addAccount(s,{id,user_metadata:{displayName:'Player '+id}});return apply(s,{type:'setCommunityVisibility',visible:true},'b');}
function invited(){return apply(base(),{type:'challengeChess',id:'local-invite',profileId:'b'},'a');}

test('a persisted chess invitation produces an incoming notice only for its recipient',()=>{
  const s=invited();
  assert.equal(notices(s,'a')[0].kind,'sent');assert.equal(notices(s,'a')[0].canRead,false);
  assert.equal(notices(s,'b')[0].kind,'invited');assert.equal(notices(s,'b')[0].otherName,'Player a');
  assert.equal(notices(s,'b')[0].key,'local-invite:invited');assert.deepEqual(notices(s,'c'),[]);
});

test('acceptance connects both players to exactly the same game and cannot be replayed',()=>{
  let s=invited();
  assert.throws(()=>apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'a'));
  assert.throws(()=>apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'c'));
  s=apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'b');
  assert.equal(s.modules.games.length,1);
  for(const id of ['a','b']){
    const n=notices(projectPlatform(s,id),id)[0];assert.equal(n.kind,'accepted');assert.equal(n.gameId,'local-invite-game');
  }
  assert.throws(()=>apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'b'));
  assert.equal(s.modules.games.length,1);assert.equal(projectPlatform(s,'c').modules.games.length,0);
});

test('declining informs the sender; cancellation informs the invited person',()=>{
  const declined=apply(invited(),{type:'respondChess',id:'local-invite',response:'declined'},'b');
  assert.equal(notices(declined,'a')[0].kind,'declined');assert.deepEqual(notices(declined,'b'),[]);assert.equal(declined.modules.games.length,0);
  assert.throws(()=>apply(invited(),{type:'respondChess',id:'local-invite',response:'cancelled'},'b'));
  const cancelled=apply(invited(),{type:'respondChess',id:'local-invite',response:'cancelled'},'a');
  assert.equal(notices(cancelled,'b')[0].kind,'cancelled');assert.deepEqual(notices(cancelled,'a'),[]);
  assert.throws(()=>apply(cancelled,{type:'respondChess',id:'local-invite',response:'accepted'},'b'));
});

test('read receipts belong to the actor and do not hide a later response event',()=>{
  let s=invited();
  assert.throws(()=>apply(s,{type:'readChessNotices',keys:['local-invite:invited']},'a'));
  assert.throws(()=>apply(s,{type:'readChessNotices',keys:['local-invite:invited']},'c'));
  s=apply(s,{type:'readChessNotices',keys:['local-invite:invited']},'b');
  s=apply(s,{type:'readChessNotices',keys:['local-invite:invited']},'b');
  assert.deepEqual(s.modules.chessRead.b,['local-invite:invited']);
  assert.deepEqual(projectPlatform(s,'a').modules.chessRead,{a:[]});
  assert.deepEqual(projectPlatform(s,'b').modules.chessRead,{b:['local-invite:invited']});
  s=apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'b');
  assert.ok(!s.modules.chessRead.b.includes(notices(s,'b')[0].key));
  assert.equal(projectPlatform(s,'b').modules.chessNotificationCapabilities.email,false);
});

test('blocking either direction hides invitations and prevents acceptance',()=>{
  for(const [actor,other] of [['a','b'],['b','a']]){
    const s=apply(invited(),{type:'blockPerson',profileId:other,blocked:true},actor);
    assert.deepEqual(notices(s,'a'),[]);assert.deepEqual(notices(s,'b'),[]);
    assert.throws(()=>apply(s,{type:'respondChess',id:'local-invite',response:'accepted'},'b'));
  }
});

test('demo invitations and exact read status survive reload without becoming email notifications',()=>{
  let s=demoReducer(createDemoState(),{type:'challengeChess',id:'local-demo-invite',profileId:'deniz',actorId:'alex'});
  s=demoReducer(s,{type:'readChessNotices',keys:['local-demo-invite:invited'],actorId:'deniz'});
  s=inspectDemoState(JSON.stringify(s)).state;
  assert.equal(notices(s,'deniz')[0].kind,'invited');assert.deepEqual(s.modules.chessRead.deniz,['local-demo-invite:invited']);
  s.modules.chessRead.deniz.push('forged','local-demo-invite:unknown');
  assert.deepEqual(inspectDemoState(JSON.stringify(s)).state.modules.chessRead.deniz,['local-demo-invite:invited']);
});

test('email preparation uses a stable event key, trusted HTTPS app link and no private addresses or login tokens',()=>{
  const challenge=invited().modules.challenges[0];
  for(const language of ['de','tr','en']){
    const mail=chessInviteEmail({challenge,language,appUrl:'https://school.example/app/'});
    assert.equal(mail.toUserId,'b');assert.equal(mail.idempotencyKey,'chess-invite/local-invite');
    assert.ok(mail.text.includes('https://school.example/app/#/me/notifications'));
    assert.ok(!JSON.stringify(mail).includes('@'));assert.ok(!JSON.stringify(mail).includes('token='));
  }
  for(const appUrl of ['http://school.example/','javascript:alert(1)','https://user:pass@school.example/','https://school.example/?redirect=outside','https://school.example/#other'])assert.equal(chessInviteEmail({challenge,appUrl}),null);
  assert.equal(chessInviteEmail({challenge:{...challenge,status:'cancelled'},appUrl:'https://school.example/'}),null);
  assert.equal(chessInviteEmail({challenge,language:'toString',appUrl:'https://school.example/'}),null);
});

test('duplicate or broken challenge references cannot duplicate notifications or open unrelated games',()=>{
  const s=invited();s.modules.challenges.push({...s.modules.challenges[0]});assert.equal(notices(s,'b').length,1);
  s.modules.challenges=[{...s.modules.challenges[0],status:'accepted',gameId:'unrelated'}];
  s.modules.games=[{id:'unrelated',whiteId:'a',blackId:'c'}];assert.deepEqual(notices(s,'b'),[]);
  assert.deepEqual(notices(s,'a'),[],'a partly shared but different game must not be linked to this invitation');
});
