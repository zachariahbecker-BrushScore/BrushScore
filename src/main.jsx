import React from 'react';
import { createRoot } from 'react-dom/client';

/* Order matters. The shim must run before App renders, because App reads
   window.storage as soon as it mounts — importing it here, at the top level,
   guarantees window.storage exists by the time createRoot runs. */
import './storageShim';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
