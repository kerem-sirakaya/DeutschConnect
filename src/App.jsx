import { Route, Routes } from 'react-router';
import AppShell from './components/layout/AppShell.jsx';
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

/**
 * Alle Seiten der App. Jede Hauptseite (Bottom-Navigation) hat eigene
 * Unterseiten, statt alles auf einer langen Seite zu zeigen.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />

        <Route path="events" element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />

        <Route path="ideas" element={<IdeasPage />} />
        <Route path="ideas/new" element={<NewIdeaPage />} />
        <Route path="ideas/:ideaId" element={<IdeaDetailPage />} />

        <Route path="network" element={<NetworkPage />} />
        <Route path="network/schools/:schoolId" element={<SchoolDetailPage />} />
        <Route path="network/projects/:projectId" element={<ProjectDetailPage />} />

        <Route path="me" element={<MePage />} />
        <Route path="me/interests" element={<InterestsPage />} />
        <Route path="me/settings" element={<SettingsPage />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
