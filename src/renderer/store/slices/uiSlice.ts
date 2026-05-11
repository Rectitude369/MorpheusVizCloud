/**
 * UI slice — local user-experience state.
 *
 * Persisted to `localStorage` via the `uiPersistMiddleware` so reopening
 * the app restores sidebar collapsed state, theme, and last-selected ids
 * (BUG-022 — these were defined but unused; now wired through the layout).
 */

import { createSlice, type PayloadAction, type Middleware } from '@reduxjs/toolkit';

const STORAGE_KEY = 'vizcloud:ui:v1';

export type Theme = 'dark' | 'light' | 'system';

export interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  searchQuery: string;
  notificationsOpen: boolean;
  selectedHostId: string | null;
  selectedVMId: string | null;
  selectedClusterId: string | null;
}

const initialState: UIState = {
  sidebarCollapsed: false,
  theme: 'dark',
  searchQuery: '',
  notificationsOpen: false,
  selectedHostId: null,
  selectedVMId: null,
  selectedClusterId: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    toggleNotifications: (state) => {
      state.notificationsOpen = !state.notificationsOpen;
    },
    setSelectedHost: (state, action: PayloadAction<string | null>) => {
      state.selectedHostId = action.payload;
    },
    setSelectedVM: (state, action: PayloadAction<string | null>) => {
      state.selectedVMId = action.payload;
    },
    setSelectedCluster: (state, action: PayloadAction<string | null>) => {
      state.selectedClusterId = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  setTheme,
  setSearchQuery,
  toggleNotifications,
  setSelectedHost,
  setSelectedVM,
  setSelectedCluster,
} = uiSlice.actions;

export default uiSlice.reducer;

/**
 * Read the previously-persisted UI state from `localStorage`. If parsing
 * fails (corrupt JSON, schema drift) we silently fall back to defaults so
 * the app always boots.
 */
export function loadPersistedUi(): UIState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return initialState;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<UIState>;
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

/**
 * Middleware that mirrors UI slice changes to localStorage. We persist
 * after every action because the UI state is small and changes infrequently.
 */
export const uiPersistMiddleware: Middleware<unknown, { ui: UIState }> = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const ui = storeApi.getState().ui;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ui));
    } catch {
      // Quota exceeded or private mode — silently drop.
    }
  }
  return result;
};
