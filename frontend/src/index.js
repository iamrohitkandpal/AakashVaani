import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

serviceWorker.register({
  onSuccess: (registration) => {
    console.log('Service Worker registered successfully!');
  },
  onUpdate: (registration) => {
    console.log('New content is available, please refresh.');
  }
});
