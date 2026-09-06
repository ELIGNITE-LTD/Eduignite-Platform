import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// HashRouter (not BrowserRouter): the production renderer is loaded from a
// `file://` path (dist/index.html) with no HTTP server behind it, so a
// history-based router would 404 on refresh/deep-link. Hash routing works
// identically in dev (Vite server) and packaged builds.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
