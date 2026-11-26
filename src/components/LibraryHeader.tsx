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
    <header className="border-b border-black/10 dark:border-white/10 px-3 sm:px-8 py-3.5 sm:py-5 transition-colors w-full overflow-hidden">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-2xl shadow-sm border border-black/10 dark:border-white/10 shrink-0">
            📜
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-2xl font-bold tracking-tight font-serif truncate">
              Scrollbound
            </h1>
            <p className="text-[11px] opacity-60 font-sans hidden md:block truncate">
              PostgreSQL-backed personal novel reader
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* User Account / Auth buttons */}
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2 border-r border-black/10 dark:border-white/10 pr-1.5 sm:pr-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name || user.email}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] sm:text-xs shrink-0">
                  {(user.name || user.email)[0].toUpperCase()}
                </div>
              )}
              <div className="text-right hidden lg:block">
                <div className="text-xs font-semibold leading-tight truncate max-w-[110px]">
                  {user.name || user.email.split('@')[0]}
                </div>
                <div className="text-[10px] opacity-60 truncate max-w-[110px]">
                  {user.email}
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="px-2 py-1.5 sm:px-2.5 text-xs rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-red-500/10 hover:text-red-500 transition"
                title="Log out of account"
              >
                <span className="hidden sm:inline">Log Out</span>
                <span className="sm:hidden text-xs">🚪</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5 border-r border-black/10 dark:border-white/10 pr-1.5 sm:pr-3">
              <button
                onClick={() => openAuthModal('login')}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl text-white transition shadow hidden sm:inline-block"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Backup & Persistence */}
          <button
            onClick={onOpenBackup}
            className="p-1.5 sm:px-3 sm:py-2 text-xs font-medium rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
            title="Database Backup & Export"
            aria-label="Database Backup and Export"
          >
            <span className="text-sm">💾</span>
            <span className="hidden sm:inline">Backup</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 sm:px-3 sm:py-2 text-xs font-medium rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
            title="Appearance Settings"
            aria-label="Appearance Settings"
          >
            <span className="text-sm">⚙️</span>
            <span className="hidden sm:inline">Appearance</span>
          </button>

          {/* Add Book */}
          <button
            onClick={onAddBook}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl text-white transition shadow-sm hover:shadow active:scale-95 flex items-center gap-1 sm:gap-1.5 shrink-0"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            title="Add a new PDF novel"
          >
            <span>➕</span>
            <span className="hidden xs:inline sm:inline">Add Book</span>
          </button>
        </div>
      </div>
    </header>
  );
}
