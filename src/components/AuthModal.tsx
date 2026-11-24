'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalMode, login, register } = useAuth();
  const [customMode, setCustomMode] = useState<'login' | 'register' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mode = customMode ?? authModalMode;

  if (!isAuthModalOpen) return null;

  const handleClose = () => {
    setCustomMode(null);
    setError(null);
    closeAuthModal();
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

        <form onSubmit={handleSubmit} className="py-5 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

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
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            {mode === 'register' && (
              <p className="text-[11px] opacity-60 mt-1">Must be at least 6 characters.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl text-white font-semibold shadow hover:shadow-md transition active:scale-[0.99] disabled:opacity-50 mt-2"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </span>
            ) : mode === 'login' ? (
              'Sign In'
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
