import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { createDemoState, demoReducer, demoStorageKey } from '../src/data/demoState.js';
import { assertRenderedText } from './text-encoding.mjs';
import { emptyPlatform, addAccount, applyPlatformAction, projectPlatform } from '../supabase/functions/_shared/platform.js';
import { accountCopy } from '../src/i18n/accountCopy.js';

// Rendering catches missing translations and broken route/data combinations.
// It does not test browser layout, focus, events or localStorage effects.
const server = await createServer({ configLoader: 'native', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  const { LanguageProvider, LanguageOverride } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx');
  const { DemoProvider, DemoContext } = await server.ssrLoadModule('/src/state/DemoContext.jsx');
  const { AccountContext } = await server.ssrLoadModule('/src/state/AccountContext.jsx');
  const routes = ['/', '/events', '/events/my', '/events/recommended', '/events/all', '/events/codewerkstatt', '/events/sprachwerkstatt', '/events/ideenlabor', '/events/kulturbruecken', '/events/unknown', '/ideas', '/ideas/my', '/ideas/all', '/ideas/new', '/ideas/schulcode', '/ideas/tandem', '/ideas/unknown', '/network', '/network/ers', '/network/anka', '/network/collaboration', '/network/unknown', '/me', '/about', '/unknown', '/discover', '/discover/interviews', '/discover/workshops', '/discover/exchange', '/discover/tutoring', '/discover/projects', '/discover/unknown', '/ideas/new?initiative=interviews', '/tutoring', '/tutoring/offers', '/tutoring/requests', '/tutoring/my', '/tutoring/new?kind=offer', '/tutoring/new?kind=request', '/tutoring/math-offer', '/tutoring/math-request', '/tutoring/german-offer', '/tutoring/coding-request', '/tutoring/unknown', '/community', '/community/people', '/community/projects', '/community/rooms', '/community/my', '/community/rooms/general', '/community/rooms/learning', '/community/rooms/projects', '/community/rooms/events', '/community/rooms/unknown', '/community/people/deniz', '/community/people/guest-mika', '/community/people/unknown'];
  routes.push('/ideas/schulcode/edit', '/ideas/unknown/edit', '/tutoring/math-offer/edit', '/tutoring/math-request/edit', '/tutoring/unknown/edit', '/tutoring/saved');
  routes.push('/me/activities', '/me/projects', '/me/tutoring', '/me/saved', '/me/community', '/me/settings', '/me/account', '/me/unknown', '/me/projects?view=collaborating', '/me/projects?view=requested', '/me/tutoring?view=requests', '/me/activities?view=joined', '/ideas/schulcode?from=' + encodeURIComponent('/me/projects?view=collaborating'));
  routes.push('/community/games','/community/games/runner','/community/games/flight','/community/games/memory','/community/games/chess','/community/games/chess/unknown','/community/games/unknown','/me/achievements','/me/moderation','/events/new');
  const escaped = (text) => renderToString(React.createElement('span', null, text)).replace(/^<span>|<\/span>$/g, '');
  function expectedHeading(route, id, t) {
    const [path, search] = route.split('?');
    const [, module, item, action] = path.split('/');
    if (path === '/') return t.app.greeting + ', ' + (id === 'alex' ? 'Alex' : 'Deniz') + '.';
    if (path === '/me') return t.app.myArea;
    if (module === 'me') return item === 'account' ? t.personal.account.title : ['activities', 'projects', 'tutoring', 'saved', 'community', 'settings', 'achievements'].includes(item) ? t.app.myArea : t.notFound.title;
    if (path === '/about') return t.aboutPage.title;
    if (module === 'events') return item === 'new' ? t.real.createEvent : t.activities[item]?.title || (!item || ['my', 'recommended', 'all'].includes(item) ? t.nav.events : t.notFound.title);
    if (module === 'ideas') {
      if (item === 'new') return t.app.newIdea;
      if (action === 'edit') return item === 'schulcode' && id === 'alex' ? t.quality.edit : t.notFound.title;
      if (item === 'schulcode') return t.app.seedCode.title;
      if (item === 'tandem') return t.ideasPage.samples[0].title;
      return !item || ['my', 'all'].includes(item) ? t.app.ideasTitle : t.notFound.title;
    }
    if (module === 'network') return ({ ers: 'Ernst-Reuter-Schule', anka: 'Anka Bilim' })[item] || (!item || item === 'collaboration' ? t.nav.network : t.notFound.title);
    if (module === 'discover') return t.ext.initiatives[item]?.title || (!item ? t.ext.discover.title : t.notFound.title);
    if (module === 'tutoring') {
      if (item === 'new') return new URLSearchParams(search).get('kind') === 'offer' ? t.ext.tutoring.newOffer : t.ext.tutoring.newRequest;
      const owner = { 'math-offer': 'alex', 'math-request': 'deniz', 'german-offer': 'deniz', 'coding-request': 'alex' }[item];
      if (action === 'edit') return owner === id ? t.quality.edit : t.notFound.title;
      if (owner) return t.ext.subjects[item.startsWith('math') ? 'math' : item.startsWith('german') ? 'german' : 'coding'] + ' · ' + t.ext.tutorSeeds[item].topics;
      return !item || ['offers', 'requests', 'my', 'saved'].includes(item) ? t.ext.tutoring.title : t.notFound.title;
    }
    if (module === 'community') {
      if (item === 'games') return !action ? t.games.title : ['runner','flight','memory','chess'].includes(action) && !path.split('/')[4] ? t.games[action] : t.notFound.title;
      if (item === 'people' && action) return ({ deniz: 'Deniz', 'guest-mika': 'Mika' })[action] ? ({ deniz: 'Deniz', 'guest-mika': 'Mika' })[action] + ' · DEMO' : t.notFound.title;
      if (item === 'rooms' && action) return t.ext.roomNames[action] || t.notFound.title;
      return t.ext.community.title;
    }
    return t.notFound.title;
  }
  for (const language of ['de', 'tr', 'en']) {
    const base = JSON.parse(readFileSync(new URL('../src/locales/' + language + '.json', import.meta.url), 'utf8'));
    const ext = JSON.parse(readFileSync(new URL('../src/locales/modules/' + language + '.json', import.meta.url), 'utf8'));
    const quality = JSON.parse(readFileSync(new URL('../src/locales/quality/' + language + '.json', import.meta.url), 'utf8'));
    const personal = JSON.parse(readFileSync(new URL('../src/locales/personal/' + language + '.json', import.meta.url), 'utf8'));
    const platform = JSON.parse(readFileSync(new URL('../src/locales/platform/' + language + '.json', import.meta.url), 'utf8'));
    const t = { ...base, ext, quality, personal, ...platform, nav: { ...base.nav, ...ext.nav } };
    for (const id of ['alex', 'deniz']) {
      const state = createDemoState(language);
      state.activeId = id;
      state.profiles[id].language = language;
      globalThis.localStorage = { getItem: (key) => key === demoStorageKey ? JSON.stringify(state) : language };
      for (const route of routes) {
        globalThis.window = { location: { hash: '#' + route } };
        const html = renderToString(React.createElement(LanguageProvider, null, React.createElement(DemoProvider, null, React.createElement(App)))).replace(/<!--.*?-->/g, '');
        assert.equal((html.match(/<h1[ >]/g) || []).length, 1, language + ' ' + id + ' ' + route + ': heading');
        assert.equal(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1], escaped(expectedHeading(route, id, t)), language + ' ' + id + ' ' + route + ': correct route content');
        assert.ok(!html.includes('undefined'), language + ' ' + route + ': missing value');
        assert.ok(!/Supabase|VITE_SUPABASE_|DC_MODERATOR_IDS/i.test(html), language + ' ' + route + ': no backend setup diagnostics in guest UI');
        if (route !== '/me/account') assert.ok(!html.includes(escaped(t.real.notConfigured)), language + ' ' + route + ': sign-in availability stays on the account page');
        assertRenderedText(html.replace(/<[^>]*>/g, ' '), language + ' ' + id + ' ' + route);
        for (const key of ['home', 'discover', 'tutoring', 'community', 'me']) assert.ok(html.includes(t.nav[key]), language + ': navigation ' + key);
        for (const href of ['#/', '#/discover', '#/tutoring', '#/community', '#/me']) assert.ok(html.includes('href="' + href + '"'), language + ': navigation target ' + href);
        if (route === '/') {
          assert.ok(html.includes(t.app.greeting + ', ' + state.profiles[id].displayName));
          assert.ok(html.includes(id === 'alex' ? t.activities.codewerkstatt.title : t.activities.sprachwerkstatt.title));
          assert.ok(html.includes(id === 'alex' ? t.app.seedCode.title : t.app.emptyMyIdeas));
        }
        if (route === '/events/all') assert.ok(html.includes(escaped(t.quality.hostSchool)), 'hosting-school filter has an explicit label');
        if (route === '/me') {
          const main = html.match(/<main[^>]*>(.*?)<\/main>/s)[1];
          assert.ok(main.includes('<strong>' + (id === 'alex' ? '0' : '1') + '</strong><span>' + escaped(personal.eventRegistrations)), 'registration count is personal');
          assert.ok(main.includes('<strong>' + (id === 'alex' ? '1' : '0') + '</strong><span>' + escaped(personal.ownedProjects)), 'owned project count is personal');
          assert.ok(!main.includes('<form'), 'overview does not stack the settings form');
        }
        if (route === '/me/account') {
          assert.ok(html.includes(escaped(personal.account.guest)));
          assert.ok(html.includes(escaped(t.real.notConfigured)));
          assert.ok(!html.includes('type="password"'), 'no imitation authentication form');
          assert.ok(!html.includes('type="email"'), 'unavailable sign-in does not collect credentials');
          assert.ok(html.includes('href="#/">' + escaped(t.real.continueDemo)), 'unavailable sign-in links back to the demo');
        }
        if (route === '/me/activities') assert.ok(html.includes(escaped(personal.noAttendance)), 'no invented attendance');
        if (route.includes('/ideas/schulcode?from=')) assert.ok(html.includes('href="#/me/projects?view=collaborating"'), 'contextual personal back route retained');
        if (route === '/ideas/new' || route === '/ideas/new?initiative=interviews') {
          assert.ok(html.includes('<details'), 'optional project fields are collapsed');
          assert.ok(html.includes('name="idea-title"') || html.includes('id="idea-title"'), 'project title input is available');
        }
      }
      console.log(language + ' / ' + id + ': ' + routes.length + ' routes rendered');
    }
    // Configuration must enable the real form without changing guest navigation.
    for (const configured of [false, true]) {
      globalThis.localStorage = { getItem:(key) => key === demoStorageKey ? JSON.stringify(createDemoState(language)) : language };
      globalThis.window = { location:{ hash:'#/me/account' } };
      const html = renderToString(React.createElement(LanguageProvider, null,
        React.createElement(AccountContext.Provider, { value:{ configured, error:configured ? '' : 'not-configured' } },
          React.createElement(DemoProvider, null, React.createElement(App)))));
      assert.equal(html.includes('type="password"'), configured, 'password field follows actual backend configuration');
      assert.equal(html.includes('type="email"'), configured, 'email field follows actual backend configuration');
      assert.ok(html.includes('href="#/me/settings"'), 'account retains navigation to settings');
      assert.ok(!/Supabase|VITE_SUPABASE_/i.test(html), 'account does not expose setup details');
      if (!configured) assert.ok(!html.includes('role="alert"'), 'unavailable account hides stale technical errors');
    }
    console.log(language + ': configured and unavailable sign-in views rendered');
    for (const code of ['confirmation-link-expired', 'confirmation-link-invalid']) {
      globalThis.window = { location:{ hash:'#/me/account' } };
      const html = renderToString(React.createElement(LanguageProvider, null,
        React.createElement(AccountContext.Provider, { value:{ configured:true, error:code } },
          React.createElement(DemoProvider, null, React.createElement(App)))));
      assert.ok(html.includes(escaped(t.real.errors[code])), 'confirmation callback shows a localized recovery message');
      assert.ok(html.includes('type="password"'), 'confirmation recovery permits normal sign-in');
      assert.ok(html.includes(escaped(t.real.resend)), 'confirmation recovery permits requesting a fresh link');
      assert.ok(!html.includes(escaped(t.notFound.title)), 'confirmation recovery is not a missing page');
      assertRenderedText(html.replace(/<[^>]*>/g, ' '), language + ': confirmation recovery');
    }
    console.log(language + ': 2 confirmation recovery views rendered');
    let flow = demoReducer(createDemoState(language), { type: 'requestIdea', id: 'schulcode', actorId: 'deniz' });
    for (const step of ['pending', 'accepted']) {
      if (step === 'accepted') flow = demoReducer(flow, { type: 'reviewIdeaRequest', id: 'schulcode', actorId: 'alex', profileId: 'deniz', decision: 'accept' });
      for (const id of ['alex', 'deniz']) {
        flow.activeId = id;
        globalThis.localStorage = { getItem: (key) => key === demoStorageKey ? JSON.stringify(flow) : language };
        globalThis.window = { location: { hash: '#/ideas/schulcode' } };
        const html = renderToString(React.createElement(LanguageProvider, null, React.createElement(DemoProvider, null, React.createElement(App))));
        assertRenderedText(html.replace(/<[^>]*>/g, ' '), language + ': project flow ' + step);
        if (step === 'pending' && id === 'alex') assert.ok(html.includes(escaped(personal.accept)), 'owner can review demo requests');
        if (id === 'deniz') assert.ok(html.includes(escaped(personal.projectStates[step === 'pending' ? 'requested' : 'member'])), 'request and demo membership have different labels');
      }
    }
    console.log(language + ': 4 project-flow states rendered');
    // Recovery UI has its own branches, which normal valid demo routes do not
    // exercise. Keep the raw originals untouched even while rendering errors.
    const damaged = createDemoState(language);
    damaged.ideas.push({ id: 'local-invalid', title: 4 });
    for (const [label, raw, message, backup] of [
      ['isolated recovery', JSON.stringify(damaged), quality.storageRecovered],
      ['invalid JSON', '{broken', quality.storageBlocked],
      ['unknown version', JSON.stringify({ version: 200 }), quality.storageBlocked],
      ['existing backup', JSON.stringify(createDemoState(language)), quality.storageBackupAvailable, '{original}'],
    ]) {
      const values = new Map([[demoStorageKey, raw], ['deutschconnect.language', language]]);
      if (backup) values.set(demoStorageKey + '.recovery.1.fixture.1', backup);
      globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, length: values.size, key: (index) => [...values.keys()][index] };
      globalThis.window = { location: { hash: '#/' } };
      const html = renderToString(React.createElement(LanguageProvider, null, React.createElement(DemoProvider, null, React.createElement(App))));
      assert.ok(html.includes(escaped(message)), language + ': ' + label + ' notice');
      assert.ok(html.includes(escaped(quality.exportRecovery)), language + ': recovery export action');
      assert.equal(values.get(demoStorageKey), raw, 'rendering must not overwrite stored input');
      assertRenderedText(html.replace(/<[^>]*>/g, ' '), language + ': ' + label);
    }
    console.log(language + ': 4 recovery states rendered');
    let live = addAccount(emptyPlatform(),{ id:'live-a',user_metadata:{ displayName:'Live Student',language } });
    live = applyPlatformAction(live,{type:'preferences',patch:{schoolId:'ers'}},'live-a');
    live = applyPlatformAction(live,{type:'createEvent',id:'local-live-event',event:{title:'Cross-school workshop',description:'A workshop proposed by an actual test account.',hostSchoolId:'ers',category:'technology',startsAt:'2090-01-01T12:00:00Z'}},'live-a');
    live = applyPlatformAction(live,{type:'submitIdea',id:'local-live-idea',idea:{title:'Shared school project',description:'A project belonging to an actual test account.',category:'open'}},'live-a');
    live = applyPlatformAction(live,{type:'submitTutoring',id:'local-live-tutor',record:{kind:'offer',subject:'Mathematik',topics:'Algebra',description:'We practice several algebra examples together.',availability:'After school',languages:['de'],format:'online'}},'live-a');
    const liveState=projectPlatform(live,'live-a',true,true);
    const liveValue={state:liveState,profile:liveState.profiles['live-a'],activities:liveState.activities,participation:liveState.participation['live-a'],access:{mode:'account',synchronized:true},dispatch:async()=>false,updatePreferences:async()=>false,storageStatus:{kind:'ready'},storageAvailable:true};
    const liveRoutes=['/','/me','/me/activities','/me/settings','/me/account','/me/achievements','/me/moderation','/events/all','/events/new','/events/local-live-event','/ideas/local-live-idea','/ideas/local-live-idea/edit','/tutoring/local-live-tutor','/tutoring/local-live-tutor/edit','/community/people','/community/rooms','/community/rooms/general','/community/games','/community/games/chess'];
    for(const route of liveRoutes){
      globalThis.window={location:{hash:'#'+route}};
      const routeValue=route==='/community/rooms/general'?{...liveValue,profile:{...liveValue.profile,isModerator:false}}:liveValue;
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(LanguageOverride,{transform:accountCopy},React.createElement(AccountContext.Provider,{value:{configured:true,user:{id:'live-a',email:'student@example.org'},signOut:async()=>{}}},React.createElement(DemoContext.Provider,{value:routeValue},React.createElement(App))))));
      assert.equal((html.match(/<h1[ >]/g)||[]).length,1,language+' live '+route+': heading');
      assert.ok(!html.includes('undefined'),language+' live '+route+': missing value');
      assert.ok(!html.includes('class="demo-tag"'),language+' live '+route+': real records must not be labeled DEMO');
      assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' live '+route);
      if(route==='/community/rooms/general')assert.ok(html.includes(escaped(t.real.groupRequired)),'non-member cannot read a real room');
      if(route==='/me/account')assert.ok(html.includes('student@example.org'),'private account page shows its own email');
    }
    console.log(language+': '+liveRoutes.length+' real-account views rendered');
    for(const moves of [[],['e2e4'],['f2f3','e7e5','g2g4','d8h4']]){
      const chess=demoReducer(createDemoState(language),{type:'startChess',id:'local-board',actorId:'alex'});chess.modules.games[0].moves=moves;
      globalThis.localStorage={getItem:(key)=>key===demoStorageKey?JSON.stringify(chess):language};globalThis.window={location:{hash:'#/community/games/chess/local-board'}};
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(DemoProvider,null,React.createElement(App))));
      assert.equal((html.match(/class="chess-square /g)||[]).length,64,'playable board has 64 squares');assert.equal((html.match(/<h1[ >]/g)||[]).length,1,'board has one heading');assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' chess board');
    }
    console.log(language+': 3 chess boards rendered');
  }
} finally {
  await server.close();
  delete globalThis.localStorage;
  delete globalThis.window;
}
