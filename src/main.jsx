import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { AppStateProvider } from './state/AppStateContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import { checkSupabaseConnection } from './lib/supabaseClient.js';

// Nur beim Entwickeln (npm run dev): Verbindung zu Supabase in der Konsole prüfen.
if (import.meta.env.DEV) checkSupabaseConnection();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
