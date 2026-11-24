'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalMode, login, register, signInWithGoogle } = useAuth();
  const [customMode, setCustomMode] = useState<'login' | 'register' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const mode = customMode ?? authModalMode;

  if (!isAuthModalOpen) return null;

  const handleClose = () => {
    setCustomMode(null);
    setError(null);
    closeAuthModal();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);
    try {
      const res = await signInWithGoogle();
      if (!res.success) {
        setError(
          res.error?.includes('NOT_CONFIGURED') || res.error?.includes('Invalid client')
            ? 'Google OAuth credentials (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) need to be configured in .env or Vercel.'
            : res.error || 'Failed to sign in with Google.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(msg);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (mode === 'login') {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || 'Failed to log in.');
      } else {
        setCustomMode(null);
      }
    } else {
      const res = await register(email, password, name);
      if (!res.success) {
        setError(res.error || 'Failed to register.');
      } else {
        setCustomMode(null);
      }
    }

    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.25)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📜</span>
            <h2 className="text-xl font-bold font-serif">
              {mode === 'login' ? 'Sign In to Scrollbound' : 'Create Account'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Google Sign In Button */}
        <div className="pt-5 pb-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 font-medium text-sm transition active:scale-[0.99] disabled:opacity-50 shadow-sm"
          >
            {isGoogleSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin text-base">⏳</span>
                <span>Connecting to Google...</span>
              </span>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.42l4.02-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-3 flex items-center justify-center">
          <div className="border-t border-black/10 dark:border-white/10 w-full" />
          <span className="bg-[var(--sb-bg)] px-3 text-[11px] opacity-60 uppercase tracking-wider shrink-0">
            or continue with email
          </span>
          <div className="border-t border-black/10 dark:border-white/10 w-full" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="pb-4 space-y-3.5 text-sm">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold opacity-80 mb-1">
                Your Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold opacity-80 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold opacity-80 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            {mode === 'register' && (
              <p className="text-[11px] opacity-60 mt-1">Must be at least 6 characters.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="w-full py-2.5 rounded-xl text-white font-semibold shadow hover:shadow-md transition active:scale-[0.99] disabled:opacity-50 mt-1"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </span>
            ) : mode === 'login' ? (
              'Sign In with Email'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-black/10 dark:border-white/10 text-center text-xs opacity-75">
          {mode === 'login' ? (
            <span>
              Don’t have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  setCustomMode('register');
                  setError(null);
                }}
                className="font-semibold underline hover:text-blue-500"
              >
                Sign Up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setCustomMode('login');
                  setError(null);
                }}
                className="font-semibold underline hover:text-blue-500"
              >
                Sign In
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
