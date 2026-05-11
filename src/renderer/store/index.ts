/**
 * Renderer Redux store.
 *
 * State is split into two layers:
 *
 *   1. **UI slice** (`uiSlice`) — local UX preferences (sidebar collapsed,
 *      theme, search query, last selected ids). Persisted to localStorage
 *      on every change so the app reopens at the same state.
 *
 *   2. **RTK Query caches** — every domain query (`hosts`, `vms`,
 *      `clusters`, `migrations`, `metrics`) lives in its own slice. Tag
 *      invalidation chains keep them coherent across mutations.
 *
 * The previous standalone `hostsSlice` / `vmsSlice` / `clustersSlice` were
 * dropped: they duplicated RTK Query state and were never written to.
 */

import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { clustersApi } from './api/clustersApi';
import { diagnosticsApi } from './api/diagnosticsApi';
import { hostsApi } from './api/hostsApi';
import { metricsApi } from './api/metricsApi';
import { migrationsApi } from './api/migrationsApi';
import { vmsApi } from './api/vmsApi';
import uiReducer, { uiPersistMiddleware, loadPersistedUi } from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    [hostsApi.reducerPath]: hostsApi.reducer,
    [vmsApi.reducerPath]: vmsApi.reducer,
    [clustersApi.reducerPath]: clustersApi.reducer,
    [migrationsApi.reducerPath]: migrationsApi.reducer,
    [metricsApi.reducerPath]: metricsApi.reducer,
    [diagnosticsApi.reducerPath]: diagnosticsApi.reducer,
  },
  preloadedState: { ui: loadPersistedUi() },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      hostsApi.middleware,
      vmsApi.middleware,
      clustersApi.middleware,
      migrationsApi.middleware,
      metricsApi.middleware,
      diagnosticsApi.middleware,
      uiPersistMiddleware,
    ),
});

// `refetchOnFocus` / `refetchOnReconnect` for every API. The renderer
// loses focus when the user switches away from VizCloud and reconnect
// fires when the network status flips — both safe triggers for refresh.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { useAppDispatch, useAppSelector } from './hooks';
