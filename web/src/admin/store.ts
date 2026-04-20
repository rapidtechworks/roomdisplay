import { create } from 'zustand';
import { api, refreshCsrfToken, clearCsrfToken } from './api.ts';

interface AuthState {
  loggedIn:    boolean;
  initialized: boolean;
  checkAuth:   () => Promise<void>;
  login:       (password: string) => Promise<void>;
  logout:      () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn:    false,
  initialized: false,

  checkAuth: async () => {
    try {
      await api.getMe();
      await refreshCsrfToken(); // pre-load token for the authenticated session
      set({ loggedIn: true, initialized: true });
    } catch {
      set({ loggedIn: false, initialized: true });
    }
  },

  login: async (password: string) => {
    // Ensure a fresh token for the anonymous (pre-login) session
    clearCsrfToken();
    await api.login(password);
    // Session has changed — get a new token for the authenticated session
    clearCsrfToken();
    await refreshCsrfToken();
    set({ loggedIn: true });
  },

  logout: async () => {
    try { await api.logout(); } catch { /* ignore */ }
    clearCsrfToken();
    set({ loggedIn: false });
  },
}));
