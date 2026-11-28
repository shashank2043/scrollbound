'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '@/lib/auth-client';
import { setSyncAuthStatus } from '@/lib/syncEngine';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image?: string | null;
  createdAt?: string | Date;
  settings?: unknown;
  _count?: {
    books: number;
    bookmarks: number;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_CACHE_KEY = 'sb_auth_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const checkAuth = useCallback(async () => {
    try {
      // 1. Check Better Auth native client session (uses signed cookie cache)
      const sessionResult = await authClient.getSession();
      if (sessionResult?.data?.user) {
        const sessionUser = sessionResult.data.user as AuthUser;
        setUser((prev) => (prev ? { ...prev, ...sessionUser } : sessionUser));
        try {
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(sessionUser));
        } catch {}
      }

      // 2. Fetch full DB user and settings from /api/auth/me
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          try {
            localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(data.user));
          } catch {}
          return;
        }
      }

      // If neither session nor /api/auth/me has a user, clear session
      if (!sessionResult?.data?.user) {
        setUser(null);
        try {
          localStorage.removeItem(AUTH_CACHE_KEY);
        } catch {}
      }
    } catch {
      // Fallback: check client-side session or preserve cached user if offline
      try {
        const sessionResult = await authClient.getSession();
        if (sessionResult?.data?.user) {
          setUser(sessionResult.data.user as AuthUser);
          return;
        }
      } catch {}

      if (typeof window !== 'undefined' && !navigator.onLine) {
        // Keep offline user if offline
      } else {
        setUser(null);
        try {
          localStorage.removeItem(AUTH_CACHE_KEY);
        } catch {}
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Restore cached user immediately on mount for 0ms visual hydration
    try {
      const cached = localStorage.getItem(AUTH_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.id) {
          setUser(parsed);
          setIsLoading(false);
        }
      }
    } catch {}

    // 2. Validate and refresh with server
    checkAuth();
  }, [checkAuth]);

  // Sync authentication state with the sync engine: cloud sync is locked when logged out
  useEffect(() => {
    setSyncAuthStatus(Boolean(user));
  }, [user]);

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message || 'Failed to sign in.' };
      }

      if (data?.user) {
        const u = data.user as AuthUser;
        setUser(u);
        try {
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(u));
        } catch {}
      }

      setIsAuthModalOpen(false);
      // Non-blocking refresh for full DB user data/settings
      checkAuth();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: msg };
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    try {
      const { data, error } = await authClient.signUp.email({
        email,
        password,
        name: name?.trim() || email.split('@')[0],
      });

      if (error) {
        return { success: false, error: error.message || 'Failed to create account.' };
      }

      if (data?.user) {
        const u = data.user as AuthUser;
        setUser(u);
        try {
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(u));
        } catch {}
      }

      setIsAuthModalOpen(false);
      checkAuth();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: msg };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const callbackURL = typeof window !== 'undefined' ? window.location.origin : '/';
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
      });

      if (result && 'error' in result && result.error) {
        return { success: false, error: (result.error as { message?: string }).message || 'Google sign-in failed.' };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in error';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      try {
        localStorage.removeItem(AUTH_CACHE_KEY);
      } catch {}
      // Clear user state immediately for instant responsive feedback on mobile & desktop
      setUser(null);
      await authClient.signOut();
    } catch {
      setUser(null);
    }
  };

  const deleteAccount = async () => {
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error || 'Failed to delete account' };
      }

      // Clear all local client storage to leave zero residual data
      try {
        localStorage.removeItem(AUTH_CACHE_KEY);
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('scrollbound_') || key.startsWith('sb_'))) {
            keysToRemove.push(key);
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k);
        }
      } catch {}

      setUser(null);
      try {
        await authClient.signOut();
      } catch {}

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account';
      return { success: false, error: msg };
    }
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        signInWithGoogle,
        logout,
        deleteAccount,
        refreshUser: checkAuth,
        openAuthModal,
        closeAuthModal,
        isAuthModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
