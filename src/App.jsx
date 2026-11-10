import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import AppShell from './components/layout/AppShell.jsx';
import AdminRoute from './components/admin/AdminRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import EventDetailPage from './pages/EventDetailPage.jsx';
import IdeasPage from './pages/IdeasPage.jsx';
import NewIdeaPage from './pages/NewIdeaPage.jsx';
import IdeaDetailPage from './pages/IdeaDetailPage.jsx';
import MePage from './pages/MePage.jsx';
import InterestsPage from './pages/InterestsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import DiscoverPage from './pages/DiscoverPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import CommunityGroupsPage from './pages/CommunityGroupsPage.jsx';
import PeoplePage from './pages/PeoplePage.jsx';
import PublicProfilePage from './pages/PublicProfilePage.jsx';
import ProfileSharingPage from './pages/ProfileSharingPage.jsx';
import TutoringPage from './pages/TutoringPage.jsx';
import TutoringFormPage from './pages/TutoringFormPage.jsx';
import TutoringDetailPage from './pages/TutoringDetailPage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import SymbolPairsPage from './pages/SymbolPairsPage.jsx';
import PaperFlightPage from './pages/PaperFlightPage.jsx';
import BridgeRunnerPage from './pages/BridgeRunnerPage.jsx';
import ChessPage from './pages/ChessPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ChatRoomPage from './pages/ChatRoomPage.jsx';
import ChatConversationPage from './pages/ChatConversationPage.jsx';

// Admin-Bereich: wird erst heruntergeladen, wenn AdminRoute den Zugriff erlaubt (lazy loading).
const AdminLayout = lazy(() => import('./components/admin/AdminLayout.jsx'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage.jsx'));
const AdminEventsPage = lazy(() => import('./pages/admin/AdminEventsPage.jsx'));
const AdminEventFormPage = lazy(() => import('./pages/admin/AdminEventFormPage.jsx'));
const AdminIdeasPage = lazy(() => import('./pages/admin/AdminIdeasPage.jsx'));
// Chat-Moderation: nur für Moderator:innen/Admins – erst bei Bedarf laden. Rechte prüft die Datenbank.
const ChatModerationPage = lazy(() => import('./pages/ChatModerationPage.jsx'));

/** Leitet alte Links wie /community/games/chess auf /games/chess um (ersetzt den Verlaufseintrag). */
function LegacyGameRedirect() {
  const { game } = useParams();
  return <Navigate to={`/games/${encodeURIComponent(game)}`} replace />;
}

/**
 * Alle Seiten der App. Jede Hauptseite (Bottom-Navigation) hat eigene
 * Unterseiten, statt alles auf einer langen Seite zu zeigen.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />

        {/* Bereich „Entdecken“ (Codex-Struktur): Übersicht + bestehende Events/Ideen-Routen */}
        <Route path="discover" element={<DiscoverPage />} />

        <Route path="events" element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />

        <Route path="ideas" element={<IdeasPage />} />
        <Route path="ideas/new" element={<NewIdeaPage />} />
        <Route path="ideas/:ideaId" element={<IdeaDetailPage />} />

        {/* Netzwerk-Bereich entfernt: alte Links/Lesezeichen (/network, /network/schools/…, /network/projects/…) → Entdecken */}
        <Route path="network/*" element={<Navigate to="/discover" replace />} />

        {/* Nachhilfe-Börse (Codex-Funktion, Claude-Backend: Migration 011) */}
        <Route path="tutoring" element={<TutoringPage />} />
        <Route path="tutoring/new" element={<TutoringFormPage />} />
        <Route path="tutoring/:entryId" element={<TutoringDetailPage />} />
        <Route path="tutoring/:entryId/edit" element={<TutoringFormPage />} />

        <Route path="community" element={<CommunityPage />} />
        {/* Projekt- und Eventgruppen = Projekt-/Eventräume aus dem Chat (Migration 014), Beiträge = Nachrichten */}
        <Route path="community/groups" element={<CommunityGroupsPage />} />
        <Route path="community/people" element={<PeoplePage />} />
        <Route path="community/people/:profileId" element={<PublicProfilePage />} />
        {/* Alte Spiele-Adressen (Spiele lagen vorher unter Community) → neue Adressen unter /games */}
        <Route path="community/games" element={<Navigate to="/games" replace />} />
        <Route path="community/games/:game" element={<LegacyGameRedirect />} />

        {/* Bereich „Spiele“: Kerems Spiele (Codex-Version) – nur im Browser, ohne Speicherung (Stufe 8a) */}
        <Route path="games" element={<GamesPage />} />
        <Route path="games/symbol-pairs" element={<SymbolPairsPage />} />
        <Route path="games/paper-flight" element={<PaperFlightPage />} />
        <Route path="games/bridge-runner" element={<BridgeRunnerPage />} />
        <Route path="games/chess" element={<ChessPage />} />

        {/* Chatroom (Migration 014) – aus, bis in der Datenbank eingeschaltet (chat_config.enabled) */}
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/rooms/:roomId" element={<ChatRoomPage />} />
        <Route path="chat/conversations/:conversationId" element={<ChatConversationPage />} />
        <Route
          path="chat/moderation"
          element={
            <Suspense fallback={<p className="muted">…</p>}>
              <ChatModerationPage />
            </Suspense>
          }
        />

        <Route path="me" element={<MePage />} />
        <Route path="me/interests" element={<InterestsPage />} />
        <Route path="me/settings" element={<SettingsPage />} />
        <Route path="me/sharing" element={<ProfileSharingPage />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route path="about" element={<AboutPage />} />
        <Route path="help" element={<HelpPage />} />

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
