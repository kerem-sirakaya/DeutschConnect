import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { AppStateProvider } from './state/AppStateContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { AdminStatusProvider } from './state/AdminStatusContext.jsx';
import { TutoringProvider } from './state/TutoringContext.jsx';
import { ToastProvider } from './components/toast/ToastContext.jsx';
import './styles/variables.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/modules.css';
import './styles/games.css';
import './styles/chat.css';
import './styles/feedback.css';
import { checkSupabaseConnection } from './lib/supabaseClient.js';
import { accentFromStorageEvent, applyAccent } from './lib/theme.js';

// Akzentfarbe: Anfangswert setzt index.html vor dem ersten Zeichnen. Hier nur: Änderung in einem
// anderen Tab übernehmen (storage-Ereignis), damit alle offenen Tabs gleich aussehen.
window.addEventListener('storage', (event) => {
  const accent = accentFromStorageEvent(event, window.localStorage);
  if (accent) applyAccent(accent);
});

// Nur beim Entwickeln (npm run dev): Verbindung zu Supabase in der Konsole prüfen.
if (import.meta.env.DEV) checkSupabaseConnection();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <AppStateProvider>
              <AdminStatusProvider>
                <TutoringProvider>
                  <App />
                </TutoringProvider>
              </AdminStatusProvider>
            </AppStateProvider>
          </AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
