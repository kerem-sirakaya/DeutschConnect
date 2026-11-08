import { test as base,expect } from '@playwright/test';
import { startBackend,password } from './backend.js';

const test=base.extend({
  backend:[async({},use)=>{const server=await startBackend();await use(server);await server.close();},{scope:'worker'}],
  actors:async({browser,backend},use,testInfo)=>{
    backend.reset();const contexts=[];const actors={};
    for(const key of ['a','b','c']){
      const device=testInfo.project.use;
      const context=await browser.newContext({baseURL:'http://127.0.0.1:4180',viewport:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch,deviceScaleFactor:device.deviceScaleFactor,serviceWorkers:'block'});
      // A simulated suite must never accidentally access a configured live project.
      await context.route('https://**',route=>route.abort());
      contexts.push(context);actors[key]=await context.newPage();
    }
    await use(actors);backend.release();for(const context of contexts)await context.close();
  },
});
const go=(page,path)=>page.goto('/#'+path);
const wake=(page)=>page.evaluate(()=>window.dispatchEvent(new Event('online')));
async function login(page,key){
  await go(page,'/me/account');await page.locator('#account-email').fill(`${key}@test.invalid`);await page.locator('#account-password').fill(password);
  await page.locator('form button[type=submit]').click();await expect(page.getByText(`${key}@test.invalid`,{exact:true})).toBeVisible();
}
async function api(page,action,commandId=crypto.randomUUID()){
  return page.evaluate(async({action,commandId})=>{
    const session=JSON.parse(localStorage.getItem('deutschconnect.auth.127.0.0.1:4181'));
    const response=await fetch('http://127.0.0.1:4181/functions/v1/platform',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_local_e2e',Authorization:'Bearer '+session.access_token},body:JSON.stringify(action?{action,commandId}:{})});
    return {status:response.status,body:await response.json()};
  },{action,commandId});
}
async function createProject(page,title='E2E school partnership'){
  await go(page,'/ideas/new');await page.locator('#idea-title').fill(title);await page.locator('#idea-description').fill('A fictional cross-school project for end-to-end testing.');
  await page.locator('form button[type=submit]').click();await expect(page).toHaveURL(/#\/ideas\/local-/);return new URL(page.url()).hash.slice(1).split('?')[0];
}
async function createTutor(page){
  await go(page,'/tutoring/new?kind=offer');
  for(const [id,value] of Object.entries({'tutor-subject':'Mathematik','tutor-topics':'Algebra exercises','tutor-support':'We practice fictional algebra exercises with another school.','tutor-availability':'After school on Monday'}))await page.locator('#'+id).fill(value);
  await page.locator('form button[type=submit]').click();await expect(page).toHaveURL(/#\/tutoring\/local-/);return new URL(page.url()).hash.slice(1).split('?')[0];
}

test('independent sessions: project creation, recipient request, accept/decline, ownership and reload',async({actors,backend})=>{
  const {a,b}=actors;await login(a,'a');await login(b,'b');
  const path=await createProject(a);const id=path.split('/').at(-1);
  await a.reload();await expect(a.getByRole('heading',{level:1})).toHaveText('E2E school partnership');
  await go(a,'/me/projects');await expect(a.getByRole('link',{name:'E2E school partnership',exact:true})).toBeVisible();
  await go(b,'/ideas/all');await b.getByRole('link',{name:'E2E school partnership',exact:true}).click();
  await b.getByRole('button',{name:'Mitwirkung anfragen',exact:true}).click();
  await expect.poll(()=>backend.getState().ideas[0].requestedIds).toEqual([backend.ids.b]);
  await go(a,path);await expect(a.locator('.request-review')).toContainText('Test B');
  await a.getByRole('button',{name:'Ablehnen',exact:true}).click();await wake(b);
  await expect(b.getByRole('button',{name:'Mitwirkung anfragen',exact:true})).toBeVisible();
  expect(backend.getState().ideas[0].participantIds).toEqual([]);
  await b.getByRole('button',{name:'Mitwirkung anfragen',exact:true}).click();await wake(a);
  await a.getByRole('button',{name:'Annehmen',exact:true}).click();await wake(b);
  await expect(b.getByRole('button',{name:'Projekt verlassen',exact:true})).toBeVisible();
  expect(backend.getState().ideas[0].participantIds).toEqual([backend.ids.b]);
  expect((await api(b,{type:'removeIdea',id})).status).toBe(400);
  await go(b,path+'/edit');await expect(b.getByRole('heading',{level:1})).not.toHaveText('Bearbeiten');
  await go(a,path+'/edit');await a.locator('#idea-title').fill('E2E edited partnership');await a.locator('form button[type=submit]').click();
  await go(b,path);await expect(b.getByRole('heading',{level:1})).toHaveText('E2E edited partnership');
});

test('failed/late saves retain drafts, retry one record and cannot redirect a newer page',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');await go(a,'/ideas/new');
  await a.locator('#idea-title').fill('E2E failure and retry');await a.locator('#idea-description').fill('A sufficiently detailed fictional project for retry testing.');
  backend.failNext('submitIdea');await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toBeVisible();
  expect(backend.getState().ideas).toHaveLength(0);await a.reload();await expect(a.locator('#idea-title')).toHaveValue('E2E failure and retry');
  backend.loseNext('submitIdea');await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toBeVisible();expect(backend.getState().ideas).toHaveLength(1);
  await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/ideas\/local-/);expect(backend.getState().ideas).toHaveLength(1);
  await go(a,'/ideas/new');await a.locator('#idea-title').fill('E2E delayed reply');await a.locator('#idea-description').fill('A delayed response must not replace a newer task.');
  backend.delayNext('submitIdea');await a.locator('form button[type=submit]').click();
  await expect.poll(()=>backend.log.filter(v=>v.type==='submitIdea').length).toBe(4);
  await a.locator('a[href="#/tutoring"]').first().click();backend.release();
  await expect.poll(()=>backend.getState().ideas.length).toBe(2);await expect(a).toHaveURL(/#\/tutoring$/);
});

test('events: pending, moderator approval, other school registration, withdrawal and distinct attendance',async({actors,backend})=>{
  const {a,b,c}=actors;await login(a,'a');await login(b,'b');await login(c,'c');await go(a,'/events/new');
  await a.locator('#event-title').fill('E2E approved workshop');await a.locator('#event-description').fill('A fictional cross-school workshop for the integration suite.');
  await a.locator('input[type=datetime-local]').fill('2090-01-01T12:00');await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/events\/local-/);
  const path=new URL(a.url()).hash.slice(1).split('?')[0],id=path.split('/').at(-1);
  await go(b,path);await expect(b.getByRole('heading',{level:1})).not.toHaveText('E2E approved workshop');
  expect((await api(b,{type:'participation',eventId:id,status:'joined'})).status).toBe(400);
  await go(c,'/me/moderation');await c.getByRole('button',{name:'Event freigeben',exact:true}).click();
  await go(b,path);await b.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect.poll(()=>backend.getState().participation[backend.ids.b][id]).toBe('joined');
  await b.reload();await expect(b.getByRole('button',{name:'Anmeldung eingegangen',exact:true})).toBeDisabled();
  expect(backend.getState().activities[0].attendance?.[backend.ids.b]).toBeUndefined();
  await go(b,'/me/activities');await expect(b.getByRole('link',{name:'E2E approved workshop',exact:true})).toBeVisible();
  await go(b,path);await b.getByRole('button',{name:'Teilnahme / Interesse zurücknehmen',exact:true}).click();
  await expect.poll(()=>backend.getState().participation[backend.ids.b][id]).toBeUndefined();
});

test('tutoring: publish/edit/close while contact text is explicitly private and never delivered',async({actors,backend})=>{
  const {a,b}=actors;await login(a,'a');await login(b,'b');const path=await createTutor(a),id=path.split('/').at(-1);
  await go(b,'/tutoring/offers');await b.getByRole('link',{name:/Mathematik.*Algebra exercises/}).click();
  await b.locator('#contact-note').fill('A fictional private draft for this algebra offer.');await b.locator('form button[type=submit]').click();
  await expect(b.getByText('Persönlicher Entwurf gespeichert – nicht versendet.',{exact:true})).toBeVisible();
  expect((await api(a)).body.state.modules.contactDrafts).toHaveLength(0);
  await b.reload();await expect(b.locator('#contact-note')).toHaveValue('A fictional private draft for this algebra offer.');
  expect((await api(b,{type:'closeTutoring',id})).status).toBe(400);
  await go(a,path+'/edit');await a.locator('#tutor-topics').fill('Edited algebra exercises');await a.locator('form button[type=submit]').click();
  await a.getByRole('button',{name:'Eintrag schließen',exact:true}).click();await expect.poll(()=>backend.getState().modules.tutoring[0].lifecycle).toBe('closed');
  await go(b,path);await expect(b.locator('#contact-note')).toHaveCount(0);
});

test('groups: authorized shared messages, lost response retry, moderation delivery and private API rejection',async({actors,backend})=>{
  const {a,b,c}=actors;for(const [key,page] of Object.entries(actors))await login(page,key);
  for(const page of [a,b]){await go(page,'/community/rooms/general');await page.getByRole('button',{name:'Gruppe beitreten',exact:true}).click();}
  await a.locator('#room-body').fill('A fictional shared workshop message.');backend.loseNext('postMessage');await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toBeVisible();
  await a.locator('form button[type=submit]').click();await expect(a.locator('#room-body')).toHaveValue('');expect(backend.getState().modules.messages).toHaveLength(1);
  // B stays open: visibility arrives through the application's real 4s poll.
  await expect(b.locator('.message-card')).toContainText('A fictional shared workshop message.');await b.reload();await expect(b.locator('.message-card')).toContainText('A fictional shared workshop message.');
  await b.locator('.report-control > button').click();await b.locator('.report-control .inline-form button').click();
  await go(c,'/me/moderation');await expect(c.getByText('A fictional shared workshop message.',{exact:true})).toBeVisible();
  await c.getByRole('button',{name:'Als geprüft markieren',exact:true}).click();await expect.poll(()=>backend.getState().modules.reports[0].status).toBe('reviewed');
  await b.getByRole('button',{name:'Gruppe verlassen',exact:true}).click();
  await expect(b.getByRole('button',{name:'Gruppe beitreten',exact:true})).toBeVisible();
  expect((await api(b)).body.state.modules.messages).toHaveLength(0);
  expect((await api(b,{type:'postMessage',id:'local-outsider-post',roomId:'general',body:'An unauthorized message.'})).status).toBe(400);
});

test('chess: invitation reaches open second account, one shared game, moves, reload, terminal result and privacy',async({actors,backend})=>{
  const {a,b,c}=actors;for(const [key,page] of Object.entries(actors))await login(page,key);
  for(const page of [a,b]){await go(page,'/me/settings');await page.getByRole('button',{name:'Profil für angemeldete Schüler freigeben',exact:true}).click();}
  await go(b,'/tutoring');await go(a,'/community/games/chess');await a.locator('.chess-panel').count();
  await a.locator('form select').selectOption(backend.ids.b);await a.getByRole('button',{name:'Herausfordern',exact:true}).click();
  await expect(b.locator('.notification-count')).toHaveText('1');await b.locator('a.notification-link').click();await b.getByRole('button',{name:'Annehmen und spielen',exact:true}).click();
  await expect(b.locator('.chess-grid')).toBeVisible();const path=new URL(b.url()).hash.slice(1),id=path.split('/').at(-1);
  await go(a,'/me/notifications');await a.getByRole('link',{name:'Zur gemeinsamen Partie',exact:true}).click();await expect(a).toHaveURL(b.url());
  for(const [page,from,to] of [[a,'f2','f3'],[b,'e7','e5'],[a,'g2','g4'],[b,'d8','h4']]){
    await wake(page);await expect(page.locator('.chess-grid button').first()).toBeEnabled();
    await page.locator(`.chess-grid button[aria-label^="${from}:"]`).click();await page.locator(`.chess-grid button[aria-label="${to}"]`).click();
  }
  await a.reload();await expect(a.locator('.game-score')).toContainText('Schwarz');expect(backend.getState().modules.games).toHaveLength(1);
  expect(backend.getState().modules.games[0].moves).toEqual(['f2f3','e7e5','g2g4','d8h4']);
  expect((await api(c,{type:'chessMove',id,revision:4,move:{from:'e2',to:'e4'}})).status).toBe(400);
  expect((await api(c)).body.state.modules.games).toHaveLength(0);
  await go(b,'/community/games/chess');await b.getByRole('button',{name:'Persönlich',exact:true}).click();await expect(b.locator('.game-leaderboard .personal-statistics > div').first().locator('dd')).toHaveText('1');
  const snapshot=(await api(b)).body.state;expect(snapshot.modules.games).toHaveLength(1);
});

test('identity and transport failures: invalid login, expired session and guest fallback',async({actors,backend})=>{
  const {a}=actors;await go(a,'/me/account');await a.locator('#account-email').fill('a@test.invalid');await a.locator('#account-password').fill('wrong');await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toBeVisible();
  await login(a,'a');backend.expire();await wake(a);await expect(a.locator('#account-email')).toBeVisible();await go(a,'/community/games');await expect(a.locator('.profile-switcher select')).toBeVisible();await expect(a.locator('h1')).toBeVisible();
});

test('registration UI, simulated confirmation, reload and logout remain separate from guest identities',async({actors,backend})=>{
  const {a}=actors;await go(a,'/me/account');await a.locator('.auth-panel .filter-chips button').nth(1).click();
  await a.locator('#account-name').fill('Registered Test');await a.locator('#account-email').fill('registered@test.invalid');await a.locator('#account-password').fill(password);
  await a.locator('form button[type=submit]').click();await expect(a.locator('.auth-panel .save-status')).toBeVisible();
  // This is deliberately a simulated confirmation, not proof of email delivery.
  backend.confirm('registered@test.invalid');await a.locator('.auth-panel .filter-chips button').first().click();
  await a.locator('#account-password').fill(password);await a.locator('form button[type=submit]').click();
  await expect(a.getByText('registered@test.invalid',{exact:true})).toBeVisible();await a.reload();await expect(a.getByText('registered@test.invalid',{exact:true})).toBeVisible();
  expect(Object.values(backend.getState().profiles).some(profile=>profile.displayName==='Registered Test')).toBe(true);
  await a.locator('.auth-panel > button').click();await expect(a.locator('.profile-switcher select')).toBeVisible();
});

test('HTTP concurrency, duplicate commands, stale revisions, blocking and private projections',async({actors,backend})=>{
  const {a,b}=actors;await login(a,'a');await login(b,'b');
  const id='local-concurrent-project',action={type:'submitIdea',id,idea:{title:'E2E concurrent project',description:'A fictional project testing concurrent requests.',category:'open'}};
  const commandId=crypto.randomUUID();const replies=await Promise.all([api(a,action,commandId),api(a,action,commandId)]);
  expect(replies.map(r=>r.status)).toEqual([200,200]);expect(backend.getState().ideas).toHaveLength(1);
  const initial=backend.getState().ideas[0];const edits=await Promise.all(['First concurrent edit','Second concurrent edit'].map(title=>api(a,{type:'updateIdea',id,expectedRecord:JSON.stringify(initial),idea:{...initial,title}})));
  expect(edits.map(r=>r.status).sort()).toEqual([200,409]);
  const privateGroup='project-'+id;expect((await api(a,{type:'createProjectGroup',ideaId:id})).status).toBe(200);
  const foreign=(await api(b)).body.state;expect(foreign.modules.groups.find(group=>group.id===privateGroup)?.memberIds||[]).toEqual([]);
  expect((await api(b,{type:'postMessage',id:'local-forbidden',roomId:privateGroup,body:'An unauthorized private-group message.'})).status).toBe(400);
  expect((await api(a,{type:'setCommunityVisibility',visible:true})).status).toBe(200);
  expect((await api(b,{type:'blockPerson',profileId:backend.ids.a,blocked:true})).status).toBe(200);
  expect((await api(b)).body.state.ideas).toHaveLength(0);
  expect((await api(a,{type:'challengeChess',id:'local-blocked-challenge',profileId:backend.ids.b})).status).toBe(400);
});

test('offline form failures preserve input and recover after reconnect without duplicate creation',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');await go(a,'/ideas/new');await a.locator('#idea-title').fill('E2E offline project');await a.locator('#idea-description').fill('A fictional project retained during a network outage.');
  await a.context().setOffline(true);
  try{await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toBeVisible();expect(backend.getState().ideas).toHaveLength(0);await expect(a.locator('#idea-title')).toHaveValue('E2E offline project');}
  finally{await a.context().setOffline(false);}
  await wake(a);await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/ideas\/local-/);expect(backend.getState().ideas).toHaveLength(1);
});

test('personal statistics and optional public fields update from saved account data only',async({actors,backend})=>{
  const {a,b}=actors;await login(a,'a');await login(b,'b');await createProject(a);
  await go(a,'/me');await expect(a.locator('.personal-statistics > div').first().locator('dd')).toHaveText('1');
  await go(a,'/me/settings');await a.locator('#display-name').fill('Test A edited');await a.locator('#profile-custom-interests').fill('Robotics');await a.locator('form button[type=submit]').click();
  await expect.poll(()=>backend.getState().profiles[backend.ids.a].displayName).toBe('Test A edited');
  await a.getByRole('button',{name:'Profil für angemeldete Schüler freigeben',exact:true}).click();await expect.poll(()=>backend.getState().modules.visibility[backend.ids.a]).toBe(true);
  let foreign=(await api(b)).body.state.modules.publicProfiles[backend.ids.a];expect(foreign.displayName).toBe('Test A edited');expect(foreign.schoolId).toBe('');expect(foreign.interests).toEqual([]);
  // The three optional sharing switches are school, interests and projects.
  const switches=a.locator('form label.checkbox-row input');await switches.nth(0).click();await switches.nth(1).click();await a.locator('form button[type=submit]').click();
  await expect.poll(()=>backend.getState().profiles[backend.ids.a].profileSharing?.interests).toBe(true);
  foreign=(await api(b)).body.state.modules.publicProfiles[backend.ids.a];expect(foreign.schoolId).toBe('ers');expect(foreign.interests).toContain('Robotics');
  await go(b,'/community/people/'+backend.ids.a);await expect(b.getByRole('heading',{level:1})).toHaveText('Test A edited');await expect(b.locator('main')).not.toContainText('a@test.invalid');
  await a.reload();await expect(a.locator('#display-name')).toHaveValue('Test A edited');
});

test('complete Symbol Pairs and arcade runs persist personal results without fabricated global scores',async({actors})=>{
  const page=actors.a;await go(page,'/community/games/memory');await page.locator('.header-actions select').selectOption('de');const cards=page.locator('.memory-card'),known=new Map();
  const settled=()=>expect.poll(()=>cards.evaluateAll(elements=>elements.filter(el=>el.disabled&&el.getAttribute('aria-pressed')!=='true').length)).toBe(0);
  // Discover cards through the same visible controls available to a player.
  for(let i=0;i<12;i+=2){
    await cards.nth(i).click();await expect(cards.nth(i)).toHaveAttribute('aria-pressed','true');const first=await cards.nth(i).innerText();await cards.nth(i+1).click();await expect(cards.nth(i+1)).toHaveAttribute('aria-pressed','true');const second=await cards.nth(i+1).innerText();
    for(const [symbol,index] of [[first,i],[second,i+1]])known.set(symbol,[...(known.get(symbol)||[]),index]);
    await settled();
  }
  for(const indices of known.values())if(!await cards.nth(indices[0]).isDisabled()){
    await cards.nth(indices[0]).click();await cards.nth(indices[1]).click();await expect(cards.nth(indices[1])).toHaveAttribute('aria-pressed','true');await settled();await expect(cards.nth(indices[0])).toBeDisabled();
  }
  await expect(page.locator('.game-result-notice')).toContainText('Ergebnis lokal gespeichert.');await page.reload();await page.getByRole('button',{name:'Persönlich',exact:true}).click();
  await expect(page.locator('.game-leaderboard .personal-statistics dd').first()).toHaveText('1');await expect(page.locator('.leaderboard-history li')).toHaveCount(1);
  for(const game of ['flight','runner']){
    await go(page,'/community/games/'+game);await page.locator('.arcade-field').press('Space');await expect(page.locator('.game-result-notice')).toContainText('Ergebnis lokal gespeichert.');
    await page.reload();await page.getByRole('button',{name:'Persönlich',exact:true}).click();await expect(page.locator('.leaderboard-history li')).toHaveCount(1);
    await expect(page.locator('.leaderboard-consent input')).not.toBeChecked();await page.locator('.leaderboard-consent input').click();await expect(page.locator('.leaderboard-consent input')).toBeChecked();await page.getByRole('button',{name:'Global',exact:true}).click();await expect(page.locator('.own-rank')).toBeVisible();
  }
});

for(const language of ['de','tr','en'])test('guest games, all categories, filters, back navigation and responsive layout: '+language,async({actors},testInfo)=>{
  const page=actors.a;await go(page,'/community/games');await page.locator('.header-actions select').selectOption(language);
  for(const game of ['chess','memory','flight','runner']){
    await go(page,'/community/games/'+game);await expect(page.locator('.game-leaderboard')).toBeVisible();
    const tabs=page.locator('.leaderboard-views button');await expect(tabs).toHaveCount(3);
    for(let i=0;i<3;i++){await tabs.nth(i).click();await expect(tabs.nth(i)).toHaveAttribute('aria-pressed','true');}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    if(['flight','runner'].includes(game)){
      if(testInfo.project.name==='mobile')await page.locator('.arcade-field').tap();else await page.locator('.arcade-field').press('Space');
      await page.getByRole('button',{name:language==='de'?'Pause':language==='tr'?'Duraklat':'Pause',exact:true}).click();await expect(page.locator('.arcade-game')).toBeVisible();
    }
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath('games-'+language+'.png'),fullPage:true});
  await go(page,'/ideas/new');await page.locator('#idea-title').fill('A preserved fictional draft');await page.locator('a[href="#/tutoring"]').first().click();await page.goBack();await expect(page.locator('#idea-title')).toHaveValue('A preserved fictional draft');
});
