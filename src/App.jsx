import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import AppShell from './components/layout/AppShell.jsx';
import AdminRoute from './components/admin/AdminRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import EventDetailPage from './pages/EventDetailPage.jsx';
import IdeasPage from './pages/IdeasPage.jsx';
import NewIdeaPage from './pages/NewIdeaPage.jsx';
import IdeaDetailPage from './pages/IdeaDetailPage.jsx';
import NetworkPage from './pages/NetworkPage.jsx';
import SchoolDetailPage from './pages/SchoolDetailPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import MePage from './pages/MePage.jsx';
import InterestsPage from './pages/InterestsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import DiscoverPage from './pages/DiscoverPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import PeoplePage from './pages/PeoplePage.jsx';
import PublicProfilePage from './pages/PublicProfilePage.jsx';
import ProfileSharingPage from './pages/ProfileSharingPage.jsx';
import TutoringPage from './pages/TutoringPage.jsx';
import TutoringFormPage from './pages/TutoringFormPage.jsx';
import TutoringDetailPage from './pages/TutoringDetailPage.jsx';

// Admin-Bereich: wird erst heruntergeladen, wenn AdminRoute den Zugriff erlaubt (lazy loading).
const AdminLayout = lazy(() => import('./components/admin/AdminLayout.jsx'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage.jsx'));
const AdminEventsPage = lazy(() => import('./pages/admin/AdminEventsPage.jsx'));
const AdminEventFormPage = lazy(() => import('./pages/admin/AdminEventFormPage.jsx'));
const AdminIdeasPage = lazy(() => import('./pages/admin/AdminIdeasPage.jsx'));

/**
 * Alle Seiten der App. Jede Hauptseite (Bottom-Navigation) hat eigene
 * Unterseiten, statt alles auf einer langen Seite zu zeigen.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />

        {/* Bereich „Entdecken“ (Codex-Struktur): Übersicht + bestehende Events/Ideen/Netzwerk-Routen */}
        <Route path="discover" element={<DiscoverPage />} />

        <Route path="events" element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />

        <Route path="ideas" element={<IdeasPage />} />
        <Route path="ideas/new" element={<NewIdeaPage />} />
        <Route path="ideas/:ideaId" element={<IdeaDetailPage />} />

        <Route path="network" element={<NetworkPage />} />
        <Route path="network/schools/:schoolId" element={<SchoolDetailPage />} />
        <Route path="network/projects/:projectId" element={<ProjectDetailPage />} />

        {/* Nachhilfe-Börse (Codex-Funktion, Claude-Backend: Migration 011) */}
        <Route path="tutoring" element={<TutoringPage />} />
        <Route path="tutoring/new" element={<TutoringFormPage />} />
        <Route path="tutoring/:entryId" element={<TutoringDetailPage />} />
        <Route path="tutoring/:entryId/edit" element={<TutoringFormPage />} />

        <Route path="community" element={<CommunityPage />} />
        <Route path="community/people" element={<PeoplePage />} />
        <Route path="community/people/:profileId" element={<PublicProfilePage />} />

        <Route path="me" element={<MePage />} />
        <Route path="me/interests" element={<InterestsPage />} />
        <Route path="me/settings" element={<SettingsPage />} />
        <Route path="me/sharing" element={<ProfileSharingPage />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route path="about" element={<AboutPage />} />

        {/* /admin/* – Anzeige-Schutz durch AdminRoute; echte Prüfung in der Datenbank */}
        <Route path="admin" element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="events" element={<AdminEventsPage />} />
            <Route path="events/new" element={<AdminEventFormPage />} />
            <Route path="events/:eventId/edit" element={<AdminEventFormPage />} />
            <Route path="ideas" element={<AdminIdeasPage />} />
            <Route path="*" element={<NotFoundPage backTo="/admin" />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
