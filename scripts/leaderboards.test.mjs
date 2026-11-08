import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardGames, leaderboardViews, arcadeResult, pairsResult, chessOutcome, personalGameStats, rankGame } from '../src/games/leaderboards.js';
import { createGameRepository, resultsKey } from '../src/games/resultRepository.js';
import { freshFlight, flightDifficulty, stepFlight, freshRunner, stepRunner } from '../src/games/arcade.js';
import { demoReducer, createDemoState } from '../src/data/demoState.js';

const now='2026-11-08T10:00:00Z';
const profiles={a:{id:'a',displayName:'Alpha',schoolId:'ers'},b:{id:'b',displayName:'Beta',schoolId:'ers'},c:{id:'c',displayName:'Gamma',schoolId:'anka'}};
const result=(game='runner',score=10,id='run-one',ownerId='a')=>({id,ownerId,game,score,completed:true,completedAt:now,...(game==='memory'?{score:1,pairs:6,turns:6}:{})});
const game=(id='game-one',winner='b',reason='checkmate')=>({id,mode:'challenge',whiteId:'a',blackId:'b',status:'ended',moves:['f2f3','e7e5','g2g4','d8h4'],result:{winner,reason}});
function storage(){const values=new Map();return {values,getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
function locks(){let queue=Promise.resolve();return {request:(_name,work)=>{const pending=queue.then(work);queue=pending.catch(()=>{});return pending;}};}

test('each game uses the same three leaderboard category keys',()=>{
  assert.deepEqual(leaderboardGames,['chess','memory','flight','runner']);
  assert.deepEqual(leaderboardViews,['global','school','personal']);
});

test('chess wins, losses and draws derive once per finished valid game ID',()=>{
  const won=game(),drawn={...game('draw'),moves:['e2e4'],result:{winner:null,reason:'agreed'}};
  const games=[won,won,drawn,{...won,id:'unfinished',status:'active'},{...won,id:'abandoned',status:'abandoned'},game('forged','w'),{...won,id:'broken',moves:['e2e9']}];
  const a=personalGameStats({game:'chess',ownerId:'a',chessGames:games});
  const b=personalGameStats({game:'chess',ownerId:'b',chessGames:games});
  assert.deepEqual([a.wins,a.losses,a.draws,a.completed,a.score],[0,1,1,2,0]);
  assert.deepEqual([b.wins,b.losses,b.draws,b.completed,b.score],[1,0,1,2,1]);
  assert.equal(a.history.length,2);
});

test('local hotseat results are separate practice and never award leaderboard points',()=>{
  const local={...game(),mode:'hotseat',whiteId:'a',blackId:'a'};
  const stats=personalGameStats({game:'chess',ownerId:'a',chessGames:[local]});
  assert.equal(stats.practice,1); assert.equal(stats.wins,0); assert.equal(stats.losses,0); assert.equal(stats.completed,0);
  assert.equal(stats.totalCompleted,1);
  assert.deepEqual(rankGame({game:'chess',profiles,sharing:{a:{chess:true}},chessGames:[local]}),[]);
});

test('chess rejects false mate, unsupported draw claims and invalid self challenges',()=>{
  assert.equal(chessOutcome({...game(),moves:[]}),null);
  assert.equal(chessOutcome({...game(),moves:[],result:{winner:'w',reason:'resigned'}}),null);
  assert.equal(chessOutcome({...game(),moves:[],result:{winner:null,reason:'claimed'}}),null);
  assert.equal(chessOutcome({...game(),whiteId:'b'}),null);
  assert.equal(chessOutcome({...game(),result:{winner:'b',reason:'abandoned'}}),null);
  assert.deepEqual(chessOutcome({...game(),moves:['e2e4'],result:{winner:'w',reason:'resigned'}}),{winner:'w',reason:'resigned'});
});

test('results produced by the existing chess reducer count automatically after checkmate',()=>{
  let s=createDemoState();
  s=demoReducer(s,{type:'challengeChess',id:'local-ranked',actorId:'alex',profileId:'deniz'});
  s=demoReducer(s,{type:'respondChess',id:'local-ranked',actorId:'deniz',response:'accepted'});
  for(const [i,move] of ['f2f3','e7e5','g2g4','d8h4'].entries()) s=demoReducer(s,{type:'chessMove',id:'local-ranked-game',actorId:i%2?'deniz':'alex',revision:i,move:{from:move.slice(0,2),to:move.slice(2)}});
  assert.equal(personalGameStats({game:'chess',ownerId:'deniz',chessGames:s.modules.games}).wins,1);
  assert.equal(personalGameStats({game:'chess',ownerId:'alex',chessGames:s.modules.games}).losses,1);
});

test('symbol pairs requires the entire valid deck and all six distinct pairs',()=>{
  const deck=[0,0,1,1,2,2,3,3,4,4,5,5];
  assert.equal(pairsResult(deck,[0,1,2,3,4],5,'run-pairs','a',now),null);
  assert.equal(pairsResult(deck,[0,1,2,3,4,4],6,'run-pairs','a',now),null);
  assert.equal(pairsResult(deck.slice(0,10),[0,1,2,3,4,5],6,'run-pairs','a',now),null);
  const finished=pairsResult(deck,[0,1,2,3,4,5],8,'run-pairs','a',now);
  assert.equal(finished.score,1);
  assert.equal(personalGameStats({game:'memory',ownerId:'a',results:[finished,finished]}).score,1);
  assert.equal(personalGameStats({game:'memory',ownerId:'a',results:[finished,{...finished,id:'run-slow',turns:100}]}).score,2,'speed and move count never determine rank');
});

test('arcade only records finished runs and keeps the maximum rather than a sum',()=>{
  assert.equal(arcadeResult('flight',freshFlight(),'run-flight','a',now),null);
  for(const kind of ['flight','runner']){
    const rows=[result(kind,30),result(kind,20,'run-two'),result(kind,30,'run-three'),result(kind,999,'run-other','b')];
    const stats=personalGameStats({game:kind,ownerId:'a',results:rows});
    assert.equal(stats.score,30); assert.equal(stats.completed,3);
    assert.ok(arcadeResult(kind,{score:3,over:true},'run-end','a',now));
    for(const score of [-1,NaN,Infinity,2.5,Number.MAX_SAFE_INTEGER]) assert.equal(arcadeResult(kind,{score,over:true},'run-invalid','a',now),null);
  }
});

test('all four rankings respect consent, school filters, ties and personal placement',()=>{
  for(const kind of leaderboardGames){
    const sharing={a:{[kind]:true},b:{[kind]:true},c:{[kind]:true}};
    const chessGames=['a','b','c'].map((id)=>({...game('game-'+id),whiteId:id,blackId:'opponent',result:{winner:'w',reason:'resigned'},moves:['e2e4']}));
    const rows=Object.keys(profiles).map((id)=>result(kind,10,'run-'+id,id));
    const args={game:kind,profiles,sharing,results:rows,chessGames};
    assert.deepEqual(rankGame(args).map((row)=>row.rank),[1,1,1]);
    assert.deepEqual(rankGame({...args,schoolId:'ers'}).map((row)=>row.id),['a','b']);
    assert.deepEqual(rankGame({...args,schoolId:''}),[]);
    sharing.b[kind]=false;
    assert.deepEqual(rankGame(args).map((row)=>row.id),['a','c']);
    assert.deepEqual(rankGame({...args,blockedIds:['c']}).map((row)=>row.id),['a']);
  }
  const ranked=rankGame({game:'runner',profiles,sharing:{a:{runner:true},b:{runner:true},c:{runner:true}},results:[result('runner',10),result('runner',10,'run-b','b'),result('runner',5,'run-c','c')]});
  assert.deepEqual(ranked.map((row)=>row.rank),[1,1,3]);
});

test('local results survive reload; duplicate submissions are idempotent and conflicting replays fail',async()=>{
  const disk=storage(),lock=locks();
  const make=()=>createGameRepository({storage:disk,locks:lock,scope:'demo',profileIds:['a','b','c']});
  const repo=make();
  assert.deepEqual(repo.getSnapshot().data.sharing,{});
  assert.equal(await repo.write({type:'record',result:result()},'a'),true);
  assert.equal(await repo.write({type:'record',result:result()},'a'),true);
  assert.equal(await repo.write({type:'record',result:result('runner',99)},'a'),false);
  assert.equal(await repo.write({type:'share',game:'runner',shared:true},'a'),true);
  assert.equal(make().getSnapshot().data.results.length,1);
  assert.equal(make().getSnapshot().data.sharing.a.runner,true);
  await repo.write({type:'share',game:'runner',shared:false},'a');
  assert.equal(make().getSnapshot().data.results.length,1,'withdrawal preserves private history');
});

test('concurrent tabs merge distinct results and count a repeated finish once',async()=>{
  const disk=storage(),lock=locks();
  const a=createGameRepository({storage:disk,locks:lock,scope:'demo',profileIds:['a','b']}),b=createGameRepository({storage:disk,locks:lock,scope:'demo',profileIds:['a','b']});
  assert.deepEqual(await Promise.all([a.write({type:'record',result:result()},'a'),b.write({type:'record',result:result()},'a'),b.write({type:'record',result:result('memory',1,'run-pairs','b')},'b')]),[true,true,true]);
  a.reload(); assert.equal(a.getSnapshot().data.results.length,2);
});

test('account, other account and demo storage remain isolated; legacy device records are not imported',async()=>{
  const disk=storage(),lock=locks();disk.setItem('deutschconnect.best.runner','999');
  for(const scope of ['demo','account:a','account:b']){
    const repo=createGameRepository({storage:disk,locks:lock,scope,profileIds:['a']});
    assert.equal(repo.getSnapshot().data.results.length,0);
    await repo.write({type:'record',result:result()},'a');
  }
  assert.notEqual(resultsKey('account:a'),resultsKey('demo'));
  assert.equal(disk.getItem('deutschconnect.best.runner'),'999');assert.equal(disk.values.size,4);
});

test('corrupt data, unknown versions, missing locks and quota errors never erase prior storage',async()=>{
  for(const raw of ['{broken','{"version":200}',JSON.stringify({version:1,results:[result('runner',-5)],sharing:{}})]){
    const disk=storage();disk.setItem(resultsKey('demo'),raw);
    const repo=createGameRepository({storage:disk,locks:locks(),scope:'demo',profileIds:['a']});
    assert.equal(repo.getSnapshot().available,false);assert.equal(await repo.write({type:'record',result:result()},'a'),false);
    assert.equal(disk.getItem(resultsKey('demo')),raw);
  }
  const disk=storage(),repo=createGameRepository({storage:disk,scope:'demo',profileIds:['a']});
  assert.equal(await repo.write({type:'record',result:result()},'a'),false);assert.equal(disk.values.size,0);
  const quota=createGameRepository({storage:{...disk,setItem(){throw new Error('quota');}},locks:locks(),scope:'demo',profileIds:['a']});
  assert.equal(await quota.write({type:'record',result:result()},'a'),false);assert.equal(quota.getSnapshot().data.results.length,0);
});

test('flight difficulty increases smoothly, stays bounded and resets with a new run',()=>{
  assert.equal(flightDifficulty(0).speed,160);
  let previous=160;
  for(let time=1;time<=1000;time++){
    const {speed,spawn}=flightDifficulty(time);assert.ok(speed>=previous && speed<=260);assert.ok(speed-previous<1.3);assert.ok(Math.abs(spawn*speed-304)<1e-8);previous=speed;
  }
  assert.equal(flightDifficulty(freshFlight().time).speed,160);
  const early=stepFlight({...freshFlight(),pipes:[{x:500,gap:150}]},.01,true);
  const late=stepFlight({...freshFlight(),time:200,pipes:[{x:500,gap:150}]},.01,true);
  assert.ok(late.pipes[0].x<early.pipes[0].x);
});

test('flight obstacles remain traversable at maximum speed and both arcade models preserve controls',()=>{
  let s={...freshFlight(),time:1000,pipes:[],spawn:0};
  const gaps=[85,205];let spawnCount=0,passed=0;
  for(let i=0;i<20000;i++){
    const nextPipe=s.pipes.find((pipe)=>pipe.x+35>77);
    const target=nextPipe?.gap??150;
    const flap=s.y>target+8 || (s.velocity>100 && s.y>target-12);
    s=stepFlight(s,1/120,flap,()=>gaps[spawnCount++%2]===85?0:1);
    assert.equal(s.over,false,'a controlled flight can cross extreme alternating gaps even at maximum speed');
    passed=s.score;if(passed>=20)break;
  }
  assert.ok(passed>=20);
  assert.ok(stepRunner(freshRunner(),.016,true).y>0);
  assert.ok(stepFlight(freshFlight(),.016,true).y<freshFlight().y);
});
