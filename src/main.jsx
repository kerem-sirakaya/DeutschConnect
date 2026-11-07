import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { DemoProvider } from './state/DemoContext.jsx';
import { AccountProvider } from './state/AccountContext.jsx';
import './styles/global.css';
import './styles/modules.css';
import './styles/games.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider><AccountProvider><DemoProvider><App /></DemoProvider></AccountProvider></LanguageProvider>
  </React.StrictMode>,
);
