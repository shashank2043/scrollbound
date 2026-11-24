'use client';

import React from 'react';

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
              Personal, reflowable browser novel reader
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Backup & Persistence */}
          <button
            onClick={onOpenBackup}
            className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
            title="Backup & Data Safety"
            aria-label="Backup and Data Safety"
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
