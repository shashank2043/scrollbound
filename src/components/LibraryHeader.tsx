'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';

interface LibraryHeaderProps {
  onAddBook: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
}

export function LibraryHeader({
  onAddBook,
  onOpenSettings,
  onOpenBackup,
}: LibraryHeaderProps) {
  const { user, openAuthModal, logout } = useAuth();

  return (
    <header className="border-b border-black/10 dark:border-white/10 px-4 sm:px-8 py-5 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-black/10 dark:border-white/10">
            📜
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-serif flex items-center gap-2">
              Scrollbound
            </h1>
            <p className="text-xs opacity-60 font-sans hidden sm:block">
              PostgreSQL-backed personal novel reader
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* User Account / Auth buttons */}
          {user ? (
            <div className="flex items-center gap-2 border-r border-black/10 dark:border-white/10 pr-2 sm:pr-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name || user.email}
                  className="w-7 h-7 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs shrink-0">
                  {(user.name || user.email)[0].toUpperCase()}
                </div>
              )}
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold leading-tight truncate max-w-[130px]">
                  {user.name || user.email.split('@')[0]}
                </div>
                <div className="text-[10px] opacity-60 truncate max-w-[130px]">
                  {user.email}
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-black/15 dark:border-white/15 hover:bg-red-500/10 hover:text-red-500 transition"
                title="Log out of account"
              >
                Log Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 border-r border-black/10 dark:border-white/10 pr-2 sm:pr-3">
              <button
                onClick={() => openAuthModal('login')}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl text-white transition shadow hidden sm:inline-block"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Backup & Persistence */}
          <button
            onClick={onOpenBackup}
            className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
            title="Database Backup & Export"
            aria-label="Database Backup and Export"
          >
            <span>💾</span>
            <span className="hidden sm:inline">Backup</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
            title="Appearance Settings"
            aria-label="Appearance Settings"
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">Appearance</span>
          </button>

          {/* Add Book */}
          <button
            onClick={onAddBook}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-white transition shadow-sm hover:shadow active:scale-95 flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          >
            <span>➕</span>
            <span>Add Book</span>
          </button>
        </div>
      </div>
    </header>
  );
}
