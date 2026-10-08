import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { initRoute } from './app/routes.ts';
import './styles/index.css';
initRoute();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
