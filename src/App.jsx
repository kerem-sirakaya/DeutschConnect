import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './i18n/LanguageContext.jsx';
import { useDemo } from './state/DemoContext.jsx';
import Header from './components/Navigation.jsx';
import Home from './pages/Home.jsx';
import Events from './pages/Events.jsx';
import EventDetails from './pages/EventDetails.jsx';
import Ideas from './pages/Ideas.jsx';
import IdeaDetails from './pages/IdeaDetails.jsx';
import IdeaSubmit from './pages/IdeaSubmit.jsx';
import Network from './pages/Network.jsx';
import MyArea from './pages/MyArea.jsx';
import About from './pages/About.jsx';
import NotFound from './pages/NotFound.jsx';
import Discover from './pages/Discover.jsx';
import Tutoring from './pages/Tutoring.jsx';
import TutoringNew from './pages/TutoringNew.jsx';
import TutoringDetails from './pages/TutoringDetails.jsx';
import Community from './pages/Community.jsx';
import PersistenceNotice from './components/PersistenceNotice.jsx';
import Games from './pages/Games.jsx';
import EventNew from './pages/EventNew.jsx';
import AccountStatus from './components/AccountStatus.jsx';
import { confirmUnsavedNavigation } from './state/usePageMemory.js';

function readRoute() { return window.location.hash.slice(1) || '/'; }
const personalSections = ['activities', 'projects', 'tutoring', 'saved', 'community', 'settings', 'account', 'achievements', 'moderation'];
const backRoutes = ['/', '/events', '/events/my', '/events/recommended', '/events/all', '/ideas/my', '/ideas/all', '/me', ...personalSections.map((section) => '/me/' + section), '/network/ers', '/network/anka', '/discover', '/community/projects', '/tutoring', '/tutoring/offers', '/tutoring/requests', '/tutoring/my', '/tutoring/saved'];

export default function App() {
  const { t } = useLanguage();
  const { profile,access } = useDemo();
  const [route, setRoute] = useState(readRoute);
  const mainRef = useRef(null);
  const previousRoute = useRef(route);
  const currentRoute = useRef(route);
  const [path, search = ''] = route.split('?');
  const requestedBack = new URLSearchParams(search).get('from');
  const returnTo = requestedBack?.length < 200 && backRoutes.includes(requestedBack.split('?')[0]) ? requestedBack : undefined;
  const parts = path.split('/');
  const page = path === '/' ? 'home' : ['me', 'about'].includes(parts[1]) ? 'me' : ['tutoring', 'community'].includes(parts[1]) ? parts[1] : 'discover';

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = readRoute();
      if (nextRoute === currentRoute.current) return;
      if (!confirmUnsavedNavigation(t.quality.unsavedWarning)) {
        window.location.hash = currentRoute.current;
        return;
      }
      currentRoute.current = nextRoute;
      setRoute(nextRoute);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [t.quality.unsavedWarning]);

  useEffect(() => {
    if (previousRoute.current !== route) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      mainRef.current?.focus({ preventScroll: true });
      previousRoute.current = route;
    }
  }, [route]);

  let content;
  if (path === '/') content = <Home />;
  else if (path === '/events/new') content = <EventNew />;
  else if (['/events', '/events/my', '/events/recommended', '/events/all'].includes(path)) content = <Events mode={parts[2] || 'my'} />;
  else if (/^\/events\/[^/]+$/.test(path)) content = <EventDetails id={parts[2]} returnTo={returnTo} />;
  else if (path === '/ideas/new') content = <IdeaSubmit initiativeId={new URLSearchParams(search).get('initiative')} />;
  else if (/^\/ideas\/[^/]+\/edit$/.test(path)) content = <IdeaSubmit id={parts[2]} />;
  else if (['/ideas', '/ideas/my', '/ideas/all'].includes(path)) content = <Ideas mode={parts[2] || 'my'} />;
  else if (/^\/ideas\/[^/]+$/.test(path)) content = <IdeaDetails id={parts[2]} returnTo={returnTo} />;
  else if (path === '/network') content = <Network />;
  else if (path === '/network/collaboration') content = <Network section="collaboration" />;
  else if (/^\/network\/[^/]+$/.test(path)) content = <Network schoolId={parts[2]} />;
  else if (path === '/me') content = <MyArea />;
  else if (path === '/me/moderation' && !profile.isModerator) content = <NotFound />;
  else if (parts[1] === 'me' && parts.length === 3 && personalSections.includes(parts[2])) content = <MyArea section={parts[2]} view={new URLSearchParams(search).get('view')} />;
  else if (path === '/about') content = <About />;
  else if (path === '/discover') content = <Discover />;
  else if (/^\/discover\/[^/]+$/.test(path)) content = <Discover id={parts[2]} />;
  else if (path === '/tutoring/new') content = <TutoringNew kind={new URLSearchParams(search).get('kind') === 'offer' ? 'offer' : 'request'} />;
  else if (/^\/tutoring\/[^/]+\/edit$/.test(path)) content = <TutoringNew id={parts[2]} />;
  else if (['/tutoring', '/tutoring/offers', '/tutoring/requests', '/tutoring/my', '/tutoring/saved'].includes(path)) content = <Tutoring mode={parts[2] || 'offers'} />;
  else if (/^\/tutoring\/[^/]+$/.test(path)) content = <TutoringDetails id={parts[2]} returnTo={returnTo} />;
  else if (['/community', '/community/people', '/community/projects', '/community/rooms', '/community/my'].includes(path)) content = <Community section={parts[2] || 'people'} />;
  else if (path === '/community/games') content = <Games />;
  else if (/^\/community\/games\/(runner|flight|memory|chess)$/.test(path)) content = <Games kind={parts[3]} />;
  else if (/^\/community\/games\/chess\/[^/]+$/.test(path)) content = <Games kind="chess" gameId={parts[4]} />;
  else if (/^\/community\/people\/[^/]+$/.test(path)) content = <Community personId={parts[3]} />;
  else if (/^\/community\/rooms\/[^/]+$/.test(path)) content = <Community section="rooms" roomId={parts[3]} />;
  else content = <NotFound />;

  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>{t.skipLink}</a>
    <Header page={page} />
    {access.mode === 'account' ? <AccountStatus /> : <PersistenceNotice />}
    {/* Page state intentionally resets per route/persona; filters and drafts restore from isolated session storage. */}
    <main id="main-content" className="main-container" ref={mainRef} tabIndex={-1} key={route + profile.id}>{content}</main>
    <footer className="site-footer"><span>{t.app.demoShort}</span><a href="#/about">{t.app.aboutLink}</a></footer>
  </>;
}
