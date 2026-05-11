import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { attachEventBridge } from './lib/event-bridge';
import { store } from './store';

import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Failed to find root element. Ensure index.html contains <div id="root"></div>.');
}

// Subscribe to main-process push events (host status, VM state, migration
// progress, metrics ticks) and patch RTK Query caches as they arrive.
attachEventBridge(store.dispatch);

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgb(var(--bg-sidebar-rgb))',
              color: 'rgb(var(--color-foreground-rgb))',
              border: '1px solid rgb(var(--border-default-rgb))',
            },
            success: {
              iconTheme: {
                primary: 'rgb(var(--color-success-rgb))',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: 'rgb(var(--color-error-rgb))',
                secondary: '#fff',
              },
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
);

