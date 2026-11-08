import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { createDemoState, demoReducer, demoStorageKey } from '../src/data/demoState.js';
import { assertRenderedText } from './text-encoding.mjs';
import { emptyPlatform, addAccount, applyPlatformAction, projectPlatform } from '../supabase/functions/_shared/platform.js';
import { accountCopy } from '../src/i18n/accountCopy.js';
import { resultsKey } from '../src/games/resultRepository.js';

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
  routes.push('/me/notifications');
  const escaped = (text) => renderToString(React.createElement('span', null, text)).replace(/^<span>|<\/span>$/g, '');
  function expectedHeading(route, id, t) {
    const [path, search] = route.split('?');
    const [, module, item, action] = path.split('/');
    if (path === '/') return t.app.greeting + ', ' + (id === 'alex' ? 'Alex' : 'Deniz') + '.';
    if (path === '/me') return t.app.myArea;
    if (module === 'me') return item === 'notifications' ? t.chessNotices.title : item === 'account' ? t.personal.account.title : item === 'achievements' ? t.awards.title : ['activities', 'projects', 'tutoring', 'saved', 'community', 'settings'].includes(item) ? t.personal.tabs[item] : t.notFound.title;
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
      const linkedRoutes=new Set();
      for (const route of routes) {
        globalThis.window = { location: { hash: '#' + route } };
        const html = renderToString(React.createElement(LanguageProvider, null, React.createElement(DemoProvider, null, React.createElement(App)))).replace(/<!--.*?-->/g, '');
        assert.equal((html.match(/<h1[ >]/g) || []).length, 1, language + ' ' + id + ' ' + route + ': heading');
        assert.equal(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1], escaped(expectedHeading(route, id, t)), language + ' ' + id + ' ' + route + ': correct route content');
        assert.ok(!html.includes('undefined'), language + ' ' + route + ': missing value');
        assert.ok(!/Supabase|VITE_SUPABASE_|DC_MODERATOR_IDS/i.test(html), language + ' ' + route + ': no backend setup diagnostics in guest UI');
        if (route !== '/me/account') assert.ok(!html.includes(escaped(t.real.notConfigured)), language + ' ' + route + ': sign-in availability stays on the account page');
        assertRenderedText(html.replace(/<[^>]*>/g, ' '), language + ' ' + id + ' ' + route);
        for(const match of html.matchAll(/href="#(\/[^"<>]*)"/g)) linkedRoutes.add(match[1].replaceAll('&amp;','&'));
        assert.ok(!/<a[^>]*href="#\/[^>]*target="_blank"/.test(html),'internal navigation stays in this application');
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
          assert.ok(main.includes('<dt>' + escaped(personal.statistics.upcomingRegistrations) + '</dt><dd>' + (id === 'alex' ? '0' : '1') + '</dd>'), 'registration count is personal');
          assert.ok(main.includes('<dt>' + escaped(personal.statistics.ownedProjects) + '</dt><dd>' + (id === 'alex' ? '1' : '0') + '</dd>'), 'owned project count is personal');
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
      for(const route of linkedRoutes){
        globalThis.window={location:{hash:'#'+route}};
        const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(DemoProvider,null,React.createElement(App))));
        assert.notEqual(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1],escaped(t.notFound.title),'generated link must resolve: '+route);
      }
      console.log(language + ' / ' + id + ': ' + routes.length + ' routes rendered; '+linkedRoutes.size+' generated link destinations resolved');
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
      assert.ok(html.includes('href="#/me"'), 'account retains navigation to its personal parent');
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
    const newAccountState=projectPlatform(addAccount(emptyPlatform(),{id:'new-account',user_metadata:{displayName:'New Student',language}}),'new-account');
    const newAccountValue={...liveValue,state:newAccountState,profile:newAccountState.profiles['new-account'],participation:newAccountState.participation['new-account']};
    for(const route of ['/ideas/new','/tutoring/new?kind=offer','/tutoring/new?kind=request']){
      globalThis.window={location:{hash:'#'+route}};
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(LanguageOverride,{transform:accountCopy},React.createElement(DemoContext.Provider,{value:newAccountValue},React.createElement(App)))));
      assert.ok(html.includes(escaped(quality.schoolRequired)),'new accounts receive an actionable school prerequisite');
      assert.ok(html.includes('href="#/me/settings"'),'school prerequisite leads to profile settings');
      assert.ok(!html.includes('type="submit"'),'incomplete account cannot submit an unusable listing');
      assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' new account '+route);
    }
    console.log(language+': 3 new-account school prerequisite views rendered');
    const legacyState={...liveState,modules:{...liveState.modules,profileCapabilities:undefined}};
    globalThis.window={location:{hash:'#/me/settings'}};
    const legacyHtml=renderToString(React.createElement(LanguageProvider,null,React.createElement(LanguageOverride,{transform:accountCopy},React.createElement(DemoContext.Provider,{value:{...liveValue,state:legacyState}},React.createElement(App)))));
    assert.ok(legacyHtml.includes(escaped(personal.profile.unavailable)),'old server cannot promise extended sharing');
    assert.ok(legacyHtml.includes('disabled="">'+escaped(personal.profile.enable)),'new sharing requires actual server capability');
    let profileFlow=addAccount(live,{id:'live-b',user_metadata:{displayName:'Other Student',language}});
    profileFlow=applyPlatformAction(profileFlow,{type:'preferences',patch:{schoolId:'anka'}},'live-b');
    profileFlow=applyPlatformAction(profileFlow,{type:'preferences',patch:{interests:['science'],profileSharing:{school:true,interests:true,projects:true}}},'live-a');
    profileFlow=applyPlatformAction(profileFlow,{type:'setCommunityVisibility',visible:true},'live-a');
    profileFlow=applyPlatformAction(profileFlow,{type:'requestIdea',id:'local-live-idea'},'live-b');
    profileFlow=applyPlatformAction(profileFlow,{type:'reviewIdeaRequest',id:'local-live-idea',profileId:'live-b',decision:'accept'},'live-a');
    profileFlow=applyPlatformAction(profileFlow,{type:'createProjectGroup',ideaId:'local-live-idea'},'live-a');
    for(const id of ['live-a','live-b']) profileFlow=applyPlatformAction(profileFlow,{type:'joinGroup',id:'general'},id);
    profileFlow=applyPlatformAction(profileFlow,{type:'postMessage',id:'local-profile-message',roomId:'general',body:'A useful shared project update.'},'live-a',{communityEnabled:true});
    profileFlow=applyPlatformAction(profileFlow,{type:'confirmProjectCompletion',id:'local-live-idea'},'live-a',{moderator:true});
    const profileState=projectPlatform(profileFlow,'live-b',false,true);
    const profileValue={...liveValue,state:profileState,profile:profileState.profiles['live-b'],activities:profileState.activities,participation:profileState.participation['live-b']};
    const profileRoutes=['/community/people/live-a?from=%2Fideas%2Flocal-live-idea','/ideas/local-live-idea','/tutoring/local-live-tutor','/events/local-live-event','/community/rooms/general','/community/rooms/project-local-live-idea','/me','/me/projects?view=completed'];
    for(const route of profileRoutes){
      globalThis.window={location:{hash:'#'+route}};
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(LanguageOverride,{transform:accountCopy},React.createElement(DemoContext.Provider,{value:profileValue},React.createElement(App))))).replace(/<!--.*?-->/g,'');
      assert.ok(!html.includes('undefined'),language+' shared '+route+': missing value');
      assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' shared '+route);
      if(!route.startsWith('/me') && !route.startsWith('/community/people')) assert.ok(html.includes('href="#/community/people/live-a?from='),route+': shared author/member links to the same profile');
      if(route.startsWith('/community/people')){
        assert.ok(html.includes('href="#/ideas/local-live-idea"'), 'profile has a contextual detail fallback');
        assert.ok(html.includes(escaped(personal.profile.completed)), 'confirmed project section rendered');
        assert.ok(!html.includes('student@example.org'),'public profile has no account email');
      }
      if(route==='/community/rooms/general') assert.ok(html.includes('A useful shared project update.'),'message branch actually renders');
    }
    console.log(language+': '+profileRoutes.length+' linked profile, message and completion views rendered');
    for(const moves of [[],['e2e4'],['f2f3','e7e5','g2g4','d8h4']]){
      const chess=demoReducer(createDemoState(language),{type:'startChess',id:'local-board',actorId:'alex'});chess.modules.games[0].moves=moves;
      globalThis.localStorage={getItem:(key)=>key===demoStorageKey?JSON.stringify(chess):language};globalThis.window={location:{hash:'#/community/games/chess/local-board'}};
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(DemoProvider,null,React.createElement(App))));
      assert.equal((html.match(/class="chess-square /g)||[]).length,64,'playable board has 64 squares');assert.equal((html.match(/<h1[ >]/g)||[]).length,1,'board has one heading');assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' chess board');
    }
    console.log(language+': 3 chess boards rendered');
    const scores={version:1,sharing:{alex:{chess:true,memory:true,flight:true,runner:true},deniz:{chess:true,memory:true,flight:true,runner:true}},results:[]};
    for(const game of ['memory','flight','runner']) for(const ownerId of ['alex','deniz']) scores.results.push({id:'run-'+game+'-'+ownerId,ownerId,game,score:game==='memory'?1:ownerId==='alex'?30:50,completed:true,completedAt:'2026-11-08T09:00:00Z',...(game==='memory'?{pairs:6,turns:8}:{})});
    const gameFixture=createDemoState(language);
    gameFixture.modules.games=[{id:'local-rank-game',mode:'challenge',whiteId:'alex',blackId:'deniz',status:'ended',moves:['f2f3','e7e5','g2g4','d8h4'],result:{winner:'b',reason:'checkmate'},revision:4,createdAt:'invalid legacy date'}];
    for(const game of ['chess','memory','flight','runner']) for(const view of ['global','school','personal']){
      globalThis.localStorage={getItem:(key)=>key===demoStorageKey?JSON.stringify(gameFixture):key===resultsKey('demo')?JSON.stringify(scores):key==='deutschconnect.language'?language:null};
      globalThis.window={location:{hash:'#/community/games/'+game},sessionStorage:{getItem:(key)=>key.endsWith(encodeURIComponent('filters:leaderboard:'+game))?JSON.stringify(view):null}};
      const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(DemoProvider,null,React.createElement(App)))).replace(/<!--.*?-->/g,'');
      assert.ok(!html.includes('undefined'),language+' '+game+' '+view+': no missing game text');
      assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' leaderboard '+game+' '+view);
      for(const label of Object.values(platform.leaderboard.views)) assert.ok(html.includes(escaped(label)),'all three categories available');
      if(view==='personal'){
        assert.ok(html.includes(escaped(platform.leaderboard.history)),'personal history rendered');
        assert.ok(html.includes('class="leaderboard-history"'),'recorded game history has entries');
        if(game==='chess')assert.ok(html.includes(escaped(platform.leaderboard.noDate)),'invalid legacy chess timestamp cannot crash personal history');
      }else{
        const table=html.match(/<table class="leaderboard-table">(.*?)<\/table>/s)?.[1];
        assert.ok(table,'demo results actually form a table');
        assert.ok(table.includes('Alex'),'own entry visible');
        assert.equal(table.includes('Deniz'),view==='global','school scope filters the other school');
        assert.ok(table.includes('own-rank'),'own rank is identifiable');
      }
      // Real accounts have no shared global board yet and must not inherit demo scores.
      globalThis.window={location:{hash:'#/community/games/'+game},sessionStorage:{getItem:()=>JSON.stringify(view)}};
      const accountHtml=renderToString(React.createElement(LanguageProvider,null,React.createElement(LanguageOverride,{transform:accountCopy},React.createElement(DemoContext.Provider,{value:liveValue},React.createElement(App)))));
      assert.ok(!accountHtml.includes('leaderboard-table'),'real accounts do not see an invented shared leaderboard');
      assert.ok(!accountHtml.includes('Anka Bilim · DEMO'),'demo participants are excluded from account boards');
      if(view!=='personal')assert.ok(accountHtml.includes(escaped(platform.leaderboard.backendMissing)),'missing shared data is explained');
    }
    console.log(language+': all 12 game/category combinations rendered in demo and account mode');
    let invitations=demoReducer(createDemoState(language),{type:'challengeChess',id:'local-notice',actorId:'alex',profileId:'deniz'});
    const notificationStates=[['incoming',invitations,'deniz'],['sent',invitations,'alex']];
    const accepted=demoReducer(invitations,{type:'respondChess',id:'local-notice',actorId:'deniz',response:'accepted'});
    notificationStates.push(['accepted',accepted,'alex'],['read',demoReducer(accepted,{type:'readChessNotices',keys:['local-notice:accepted'],actorId:'alex'}),'alex']);
    notificationStates.push(['declined',demoReducer(invitations,{type:'respondChess',id:'local-notice',actorId:'deniz',response:'declined'}),'alex']);
    notificationStates.push(['cancelled',demoReducer(invitations,{type:'respondChess',id:'local-notice',actorId:'alex',response:'cancelled'}),'deniz']);
    for(const [label,noticeState,id] of notificationStates){
      noticeState.activeId=id;
      globalThis.localStorage={getItem:(key)=>key===demoStorageKey?JSON.stringify(noticeState):key==='deutschconnect.language'?language:null};
      for(const route of ['/tutoring','/me/notifications']){
        globalThis.window={location:{hash:'#'+route}};
        const html=renderToString(React.createElement(LanguageProvider,null,React.createElement(DemoProvider,null,React.createElement(App))));
        assert.ok(html.includes('notification-link'),'bell is present outside the games module');
        const expectedKind=label==='incoming'?'invited':label==='read'?'accepted':label;
        if(route==='/me/notifications')assert.ok(html.includes(escaped(platform.chessNotices.kinds[expectedKind])),'correct stored invitation state rendered');
        if(label==='incoming'&&route==='/me/notifications')assert.ok(html.includes(escaped(platform.chessNotices.acceptPlay)),'recipient can accept directly in inbox');
        if(label==='accepted'&&route==='/me/notifications')assert.ok(html.includes('href="#/community/games/chess/local-notice-game"'),'sender is connected to the same accepted game');
        assert.equal(html.includes('class="notification-count"'),!['read','sent'].includes(label),'read status and outgoing pending notices do not inflate the badge');
        assertRenderedText(html.replace(/<[^>]*>/g,' '),language+' chess notices '+label);
      }
    }
    console.log(language+': 12 invitation inbox and cross-module notification views rendered');
  }
} finally {
  await server.close();
  delete globalThis.localStorage;
  delete globalThis.window;
}
