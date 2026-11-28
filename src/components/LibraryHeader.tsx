'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Scroll, LogOut, HardDrive, Settings, Plus, BookOpen, Globe, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/admin';
import { ProfileModal } from './ProfileModal';

interface LibraryHeaderProps {
  onAddBook: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  activeTab?: 'personal' | 'public';
  onTabChange?: (tab: 'personal' | 'public') => void;
  publicCount?: number;
  personalCount?: number;
}

export function LibraryHeader({
  onAddBook,
  onOpenSettings,
  onOpenBackup,
  activeTab = 'personal',
  onTabChange,
  publicCount,
  personalCount,
}: LibraryHeaderProps) {
  const { user, openAuthModal, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const userIsAdmin = isAdmin(user?.email);

  return (
    <>
      <header className="border-b border-black/10 dark:border-white/10 px-3 sm:px-8 py-3 sm:py-4 transition-colors w-full max-w-full overflow-x-hidden">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-4 w-full min-w-0">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm border border-black/10 dark:border-white/10 shrink-0 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition">
                <Scroll className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-2xl font-bold tracking-tight font-serif truncate">
                  Scrollbound
                </h1>
                <p className="text-[11px] opacity-60 font-sans hidden md:block truncate">
                  PostgreSQL-backed personal novel reader
                </p>
              </div>
            </Link>
          </div>

          {/* Library Tabs (Personal vs Public) */}
          {onTabChange && (
            <div className="flex items-center p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-medium">
              <button
                type="button"
                onClick={() => onTabChange('personal')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition touch-manipulation cursor-pointer ${
                  activeTab === 'personal'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'opacity-70 hover:opacity-100'
                }`}
                aria-label="My Library"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>My Library</span>
                {personalCount !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === 'personal'
                        ? 'bg-white/20 text-white'
                        : 'bg-black/10 dark:bg-white/10'
                    }`}
                  >
                    {personalCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onTabChange('public')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition touch-manipulation cursor-pointer ${
                  activeTab === 'public'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'opacity-70 hover:opacity-100'
                }`}
                aria-label="Public Library"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Public Library</span>
                {publicCount !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === 'public'
                        ? 'bg-white/20 text-white'
                        : 'bg-black/10 dark:bg-white/10'
                    }`}
                  >
                    {publicCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Admin Dashboard Link (Visible only to shashankpulluri1@gmail.com) */}
            {userIsAdmin && (
              <Link
                href="/admin"
                className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 active:scale-95 transition flex items-center gap-1.5"
                title="Admin Dashboard (User & Usage Analytics)"
                aria-label="Admin Dashboard"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            {/* User Account / Auth buttons */}
            {user ? (
              <div className="flex items-center gap-1 sm:gap-2 border-r border-black/10 dark:border-white/10 pr-1 sm:pr-2.5">
                {/* Profile Avatar & Info Button */}
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition cursor-pointer touch-manipulation group text-left"
                  title="View Profile & Account Settings"
                  aria-label="View Profile & Account Settings"
                >
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt={user.name || user.email}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0 group-hover:ring-2 group-hover:ring-blue-500/50 transition"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] sm:text-xs shrink-0 group-hover:ring-2 group-hover:ring-blue-500/50 transition">
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
                </button>

                {/* Mobile & Desktop Logout Button */}
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await logout();
                  }}
                  className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center px-2 py-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition touch-manipulation cursor-pointer shrink-0"
                  title="Log out of account"
                  aria-label="Log out of account"
                >
                  <LogOut className="w-4 h-4 sm:hidden" />
                  <span className="hidden sm:inline">Log Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 border-r border-black/10 dark:border-white/10 pr-1 sm:pr-2">
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition touch-manipulation"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('register')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl text-white transition shadow hidden md:inline-block active:scale-95 touch-manipulation"
                  style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Backup & Persistence (Visible on sm: screens and up, leaving room on mobile) */}
            <button
              onClick={onOpenBackup}
              className="hidden sm:flex p-1.5 sm:px-3 sm:py-2 text-xs font-medium rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition items-center gap-1.5"
              title="Database Backup & Export"
              aria-label="Database Backup and Export"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Backup</span>
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 sm:px-3 sm:py-2 text-xs font-medium rounded-lg sm:rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
              title="Appearance Settings"
              aria-label="Appearance Settings"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Appearance</span>
            </button>

            {/* Add Book Button (Compact icon on mobile, full label on tablet/desktop) */}
            <button
              onClick={onAddBook}
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl text-white transition shadow-sm hover:shadow active:scale-95 flex items-center gap-1 sm:gap-1.5 shrink-0"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              title={activeTab === 'public' && userIsAdmin ? 'Add Book to Public Library' : 'Add a new PDF novel'}
              aria-label="Add a new PDF novel"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab === 'public' && userIsAdmin ? 'Add Public Book' : 'Add Book'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Profile Details & Account Management Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </>
  );
}
