import test from 'node:test';
import assert from 'node:assert/strict';
import { listenToRoutes, replaceRoute } from '../src/state/routeHistory.js';

// Browser History contract simulation; this does not replace a real browser test.
function browser(initial = '/') {
  const entries=[{route:initial,state:null}], listeners=new Set(); let position=0;
  const api={
    location:{get hash(){return '#'+entries[position].route;}},
    history:{get state(){return entries[position].state;},replaceState(state,_title,url){entries[position]={route:url?.slice(1) || entries[position].route,state};},go(delta){const next=position+delta;if(next<0 || next>=entries.length)return;position=next;api.dispatchEvent();}},
    addEventListener(_name,listener){listeners.add(listener);},removeEventListener(_name,listener){listeners.delete(listener);},
    dispatchEvent(){for(const listener of listeners)listener();},
    navigate(route){entries.splice(position+1);entries.push({route,state:null});position++;api.dispatchEvent();},
    back(){api.history.go(-1);},forward(){api.history.go(1);},get length(){return entries.length;}
  }; return api;
}

test('internal routes support Back and Forward without adding duplicate entries',()=>{
  const b=browser(),seen=[];
  const stop=listenToRoutes(b,{confirm:()=>true,onRoute:(route)=>seen.push(route)});
  b.navigate('/ideas/all');b.navigate('/ideas/local-a');b.navigate('/community/people/b');
  b.back();assert.equal(b.location.hash,'#/ideas/local-a');
  b.back();assert.equal(b.location.hash,'#/ideas/all');
  b.forward();assert.equal(b.location.hash,'#/ideas/local-a');
  assert.equal(b.length,4);assert.equal(seen.at(-1),'/ideas/local-a');stop();
});

test('cancelling navigation keeps an unprotected draft mounted and restores history position',()=>{
  const b=browser();let allowed=true,rendered='/';
  listenToRoutes(b,{confirm:()=>allowed,onRoute:(route)=>rendered=route});
  b.navigate('/ideas/all');b.navigate('/ideas/new');allowed=false;
  b.back();assert.equal(rendered,'/ideas/new');assert.equal(b.location.hash,'#/ideas/new');
  b.navigate('/tutoring');assert.equal(rendered,'/ideas/new');assert.equal(b.location.hash,'#/ideas/new');
  allowed=true;b.forward();assert.equal(rendered,'/tutoring');
});

test('saving replaces a form so Back returns to its source list instead of reopening an empty form',()=>{
  const b=browser('/ideas/all');let rendered='/ideas/all';
  listenToRoutes(b,{confirm:()=>true,onRoute:(route)=>rendered=route});
  b.navigate('/ideas/new');replaceRoute(b,'/ideas/local-saved?from=%2Fme%2Fprojects');
  assert.equal(rendered,'/ideas/local-saved?from=%2Fme%2Fprojects');assert.equal(b.length,2);
  b.back();assert.equal(rendered,'/ideas/all');b.forward();assert.equal(rendered,'/ideas/local-saved?from=%2Fme%2Fprojects');
});

test('deep links and language resubscription preserve usable history metadata',()=>{
  const b=browser('/community/people/b');
  let stop=listenToRoutes(b,{confirm:()=>true,onRoute:()=>{}});
  assert.equal(b.history.state.dcPrevious,undefined,'a direct link needs a fallback parent');
  b.navigate('/ideas/local-a');stop();
  stop=listenToRoutes(b,{confirm:()=>true,onRoute:()=>{}});
  assert.equal(b.history.state.dcPrevious,'/community/people/b');b.back();
  assert.equal(b.location.hash,'#/community/people/b');stop();
});

test('incoming auth tokens never enter application route history metadata',()=>{
  const b=browser('access_token=fake-access&refresh_token=fake-refresh');
  const stop=listenToRoutes(b,{confirm:()=>true,onRoute:()=>{}});
  assert.equal(b.history.state.dcRoute,'/me/account');
  assert.ok(!JSON.stringify(b.history.state).includes('fake-access'));stop();
});

test('a route changed before subscription is synchronized even when the pending hash event repeats it',()=>{
  const b=browser('/me/account');let rendered='/me/account';
  const old=listenToRoutes(b,{confirm:()=>true,onRoute:route=>{rendered=route;}});old();
  b.navigate('/ideas/new');
  const stop=listenToRoutes(b,{confirm:()=>true,onRoute:route=>{rendered=route;}});b.dispatchEvent();
  assert.equal(rendered,'/ideas/new');assert.equal(b.history.state.dcRoute,'/ideas/new');stop();
});
