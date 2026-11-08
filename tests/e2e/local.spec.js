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
  await page.locator('form button[type=submit]').click();await expect(page).toHaveURL(/#\/me$/);await go(page,'/me/account');await expect(page.getByText(`${key}@test.invalid`,{exact:true})).toBeVisible();
}
async function openConfirmation(page,suffix){
  // Model a navigation from the provider/Gmail, not an in-app hash-only link.
  await page.goto('about:blank');
  try{await page.goto('/'+suffix);}catch{throw Error('Synthetic callback navigation failed (URL suppressed).');}
  expect(await page.evaluate(()=>!/access_token|refresh_token|token_hash|\?code=/.test(location.href))).toBe(true);
}
async function register(page,email,name){
  await go(page,'/me/account');await page.locator('.header-actions select').selectOption('de');await page.locator('.auth-panel .filter-chips button').nth(1).click();
  await page.locator('#account-name').fill(name);await page.locator('#account-email').fill(email);await page.locator('#account-password').fill(password);await page.locator('form button[type=submit]').click();await expect(page.locator('.auth-panel .save-status')).toBeVisible();
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

test('a revoked session returns to sign-in through normal polling without a reconnect event',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');backend.expire();
  await expect(a.locator('#account-email')).toBeVisible();await expect(a.locator('.profile-switcher select')).toBeVisible();
});

test('two new accounts confirm in independent browsers and the original registration browser signs into its own profile',async({actors,backend})=>{
  const {a,b,c}=actors;
  await register(a,'new-one@test.invalid','New Student One');await openConfirmation(b,backend.confirmation('new-one@test.invalid'));await expect(b).toHaveURL(/#\/me$/);
  await register(a,'new-two@test.invalid','New Student Two');await openConfirmation(c,backend.confirmation('new-two@test.invalid'));await expect(c).toHaveURL(/#\/me$/);
  const first=(await api(b)).body.state.activeId,second=(await api(c)).body.state.activeId;expect(first).not.toBe(second);
  await a.locator('.auth-panel .filter-chips button').first().click();await a.locator('#account-email').fill('new-one@test.invalid');await a.locator('#account-password').fill(password);await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/me$/);
  expect((await api(a)).body.state.activeId).toBe(first);await a.reload();expect((await api(a)).body.state.activeId).toBe(first);
  await go(b,'/me/account');await expect(b.getByText('new-one@test.invalid',{exact:true})).toBeVisible();await go(c,'/me/account');await expect(c.getByText('new-two@test.invalid',{exact:true})).toBeVisible();
});

test('a confirmation for another signed-in account requires a visible explicit switch',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');await openConfirmation(a,backend.confirmation('b@test.invalid'));
  await expect(a.getByRole('button',{name:'Zum bestätigten Konto wechseln',exact:true})).toBeVisible();expect((await api(a)).body.state.activeId).toBe(backend.ids.a);
  await a.getByRole('button',{name:'Beim bisherigen Konto bleiben',exact:true}).click();await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
  await openConfirmation(a,backend.confirmation('b@test.invalid'));await a.getByRole('button',{name:'Zum bestätigten Konto wechseln',exact:true}).click();await expect(a).toHaveURL(/#\/me$/);
  expect((await api(a)).body.state.activeId).toBe(backend.ids.b);await a.reload();expect((await api(a)).body.state.activeId).toBe(backend.ids.b);
  await go(a,'/me/account');await expect(a.getByText('b@test.invalid',{exact:true})).toBeVisible();await expect(a.locator('main')).not.toContainText('a@test.invalid');
});

test('verified email with unavailable app profile offers real sign-in and recovers without forced logout',async({actors,backend})=>{
  const {a}=actors;await register(a,'profile-retry@test.invalid','Profile Retry');backend.blockProfileReads(true);await openConfirmation(a,backend.confirmation('profile-retry@test.invalid'));
  await expect(a.getByRole('heading',{level:1})).toHaveText('Dein persönlicher Bereich wird vorbereitet');await expect(a.getByText(/HTTP 503 \/ unavailable/)).toBeVisible();
  await a.getByRole('button',{name:'Reguläre Anmeldung öffnen',exact:true}).click();await expect(a.locator('#account-email')).toBeVisible();
  expect(Object.values(backend.getState().profiles).some(profile=>profile.displayName==='Profile Retry')).toBe(false);
  backend.blockProfileReads(false);await a.locator('#account-email').fill('profile-retry@test.invalid');await a.locator('#account-password').fill(password);await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/me$/);
  await a.reload();await go(a,'/me/account');await expect(a.getByText('profile-retry@test.invalid',{exact:true})).toBeVisible();
});

test('confirmation without session, expired link, missing credentials and a foreign PKCE code all have honest recovery',async({actors,backend})=>{
  const {a}=actors;await go(a,'/me/account');await a.locator('.header-actions select').selectOption('de');await openConfirmation(a,backend.confirmation('b@test.invalid',false));
  await expect(a.getByText('E-Mail bestätigt. Es wurde keine Anmeldung übernommen. Melde dich jetzt mit deinem Passwort an.',{exact:true})).toBeVisible();await expect(a.locator('#account-email')).toBeVisible();await expect(a.locator('.profile-switcher select')).toBeVisible();
  for(const suffix of ['#error=access_denied&error_code=otp_expired','#access_token=incomplete','?code=synthetic-other-browser-code']){
    await openConfirmation(a,suffix);await expect(a.getByRole('alert')).toBeVisible();await expect(a.locator('#account-email')).toBeVisible();
  }
  await login(a,'a');await openConfirmation(a,'#error=access_denied&error_code=otp_expired');await expect(a.getByRole('alert')).toBeVisible();await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
});

test('email proof without a session leaves the current account intact and offers password sign-in without a dashboard redirect',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');
  const proof=backend.confirmation('b@test.invalid',false);await openConfirmation(a,proof);
  await expect(a.getByText('E-Mail bestätigt. Es wurde keine Anmeldung übernommen. Melde dich jetzt mit deinem Passwort an.',{exact:true})).toBeVisible();
  await expect(a).toHaveURL(/#\/me\/account$/);await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
  await a.getByRole('button',{name:'Reguläre Anmeldung öffnen',exact:true}).click();await expect(a.locator('#account-email')).toBeVisible();
  await openConfirmation(a,proof);await expect(a.getByRole('alert')).toContainText('abgelaufen');await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
});

test('account actions stay locked while sending and mail feedback belongs only to the submitted mode',async({actors,backend})=>{
  const page=actors.a;await go(page,'/me/account');await page.locator('.header-actions select').selectOption('de');
  await page.locator('.auth-panel .filter-chips button').nth(1).click();
  await page.locator('#account-name').fill('Fictional Registration');await page.locator('#account-email').fill('new@test.invalid');await page.locator('#account-password').fill(password);
  backend.delayAuth('signup');await page.locator('form button[type=submit]').click();
  await expect(page.locator('.auth-panel .filter-chips button').first()).toBeDisabled();await expect(page.locator('.auth-panel form')).toHaveAttribute('aria-busy','true');
  backend.release();await expect(page.locator('.auth-panel .save-status')).toBeVisible();
  await page.locator('.auth-panel .filter-chips button').first().click();await expect(page.locator('.auth-panel .save-status')).toHaveCount(0);
  await page.locator('#account-email').fill('invalid');await page.locator('#account-password').fill('x');await page.locator('form button[type=submit]').click();
  await expect(page.locator('#account-email')).toBeFocused();await expect(page.locator('#account-email')).toHaveAttribute('aria-invalid','true');
});

test('navigation matches the URL through immediate account and language transitions',async({actors})=>{
  const {a}=actors;await login(a,'a');
  for(const language of ['tr','en','de']){
    await a.locator('.header-actions select').selectOption(language);await go(a,'/ideas/new');await expect(a.locator('#idea-title')).toBeVisible();
    await go(a,'/me/account');await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
  }
});

test('event form focuses specific errors, preserves failed drafts and visibly waits for one confirmed save',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');await go(a,'/events/new');await a.locator('#event-title').fill('ab');await a.locator('form button[type=submit]').click();
  await expect(a.locator('#event-title')).toBeFocused();await expect(a.locator('#event-title')).toHaveAttribute('aria-invalid','true');
  await a.locator('#event-title').fill('E2E reliable event form');await a.locator('#event-description').fill('A fictional event with precise validation and recoverable storage.');await a.locator('input[type=datetime-local]').fill('2000-01-01T12:00');await a.locator('form button[type=submit]').click();
  await expect(a.locator('input[type=datetime-local]')).toBeFocused();await expect(a.locator('input[type=datetime-local]')).toHaveAttribute('aria-invalid','true');
  expect(backend.log.filter(item=>item.type==='createEvent')).toHaveLength(0);
  await a.locator('input[type=datetime-local]').fill('2090-01-01T12:00');backend.failNext('createEvent');await a.locator('form button[type=submit]').click();await expect(a.getByRole('alert')).toContainText('Speichern');
  await a.reload();await expect(a.locator('#event-title')).toHaveValue('E2E reliable event form');await expect(a.locator('main')).toContainText('Entwurf');
  backend.delayNext('createEvent');await a.evaluate(()=>{const form=document.querySelector('main form');form.requestSubmit();form.requestSubmit();});
  await expect(a.locator('main form')).toHaveAttribute('aria-busy','true');await expect(a.locator('form button[type=submit]')).toHaveText('Wird gespeichert…');
  await expect.poll(()=>backend.log.filter(item=>item.type==='createEvent').length).toBe(2);backend.release();await expect(a).toHaveURL(/#\/events\/local-/);expect(backend.getState().activities).toHaveLength(1);
});

test('manual retry and background refresh share one request and show a disabled loading control',async({actors,backend})=>{
  const {a}=actors;await login(a,'a');backend.failNext('read');await wake(a);await expect(a.locator('.storage-warning button')).toBeVisible();
  backend.delayNext('read');const before=backend.log.filter(item=>item.type==='read').length;
  await a.locator('.storage-warning button').click();await expect(a.locator('.storage-warning button')).toBeDisabled();
  await wake(a);await wake(a);await expect.poll(()=>backend.log.filter(item=>item.type==='read').length).toBe(before+1);
  backend.release();await expect(a.locator('.storage-warning')).toHaveCount(0);await expect(a.getByText('a@test.invalid',{exact:true})).toBeVisible();
});

test('moderation read access does not claim group posting permission without membership',async({actors})=>{
  const {c}=actors;await login(c,'c');await go(c,'/community/rooms/general');
  await expect(c.getByRole('heading',{level:1})).toBeVisible();await expect(c.locator('#room-body')).toHaveCount(0);
  await c.getByRole('button',{name:'Gruppe beitreten',exact:true}).click();await expect(c.locator('#room-body')).toBeVisible();
});

test('registration UI, simulated confirmation, reload and logout remain separate from guest identities',async({actors,backend})=>{
  const {a}=actors;await go(a,'/me/account');await a.locator('.auth-panel .filter-chips button').nth(1).click();
  await a.locator('#account-name').fill('Registered Test');await a.locator('#account-email').fill('registered@test.invalid');await a.locator('#account-password').fill(password);
  await a.locator('form button[type=submit]').click();await expect(a.locator('.auth-panel .save-status')).toBeVisible();
  // This is deliberately a simulated confirmation, not proof of email delivery.
  backend.confirm('registered@test.invalid');await a.locator('.auth-panel .filter-chips button').first().click();
  await a.locator('#account-password').fill(password);await a.locator('form button[type=submit]').click();
  await expect(a).toHaveURL(/#\/me$/);await go(a,'/me/account');await expect(a.getByText('registered@test.invalid',{exact:true})).toBeVisible();await a.reload();await expect(a.getByText('registered@test.invalid',{exact:true})).toBeVisible();
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
  await go(page,'/me/account');await page.locator('#account-email').fill('invalid');await page.locator('#account-password').fill('x');await page.locator('form button[type=submit]').click();
  await expect(page.locator('#account-email')).toBeFocused();await expect(page.locator('#account-email')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#account-email-error')).toBeVisible();
});
