import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { DemoProvider } from './state/DemoContext.jsx';
import { AccountProvider } from './state/AccountContext.jsx';
import { captureAuthCallback } from './services/authCallback.js';
import './styles/global.css';
import './styles/modules.css';
import './styles/games.css';

const initialCallback=captureAuthCallback(window.location,window.history);
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider><AccountProvider initialCallback={initialCallback}><DemoProvider><App /></DemoProvider></AccountProvider></LanguageProvider>
  </React.StrictMode>,
);
