'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { User, X, LogOut, Trash2, AlertTriangle, Loader2, BookOpen, Bookmark, BarChart3, ShieldCheck } from 'lucide-react';
import { useAuth, AuthUser } from '../context/AuthContext';
import { isAdmin } from '../lib/admin';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProfileStats {
  booksCount: number;
  bookmarksCount: number;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, logout, deleteAccount } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch live stats when modal opens
  useEffect(() => {
    if (!isOpen || !user) return;

    setIsConfirmingDelete(false);
    setDeleteError(null);
    setIsLoadingStats(true);

    fetch('/api/auth/profile', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?._count) {
          setStats({
            booksCount: data.user._count.books ?? 0,
            bookmarksCount: data.user._count.bookmarks ?? 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingStats(false));
  }, [isOpen, user]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !user) return null;

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleDeleteProfile = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteAccount();
    setIsDeleting(false);

    if (result.success) {
      onClose();
      // Reload page to bring user to clean public state
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } else {
      setDeleteError(result.error || 'Failed to delete account');
    }
  };

  const formatDate = (dateVal?: string | Date) => {
    if (!dateVal) return 'Recently';
    try {
      const d = new Date(dateVal);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="User Profile"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl transition-all relative overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold">Profile</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition cursor-pointer touch-manipulation disabled:opacity-50"
            aria-label="Close profile modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Content Body */}
        <div className="overflow-y-auto py-4 space-y-5">
          {/* User Info Card */}
          <div className="flex items-center gap-3.5 sm:gap-4 p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name || user.email}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0 shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xl sm:text-2xl shrink-0 shadow-sm">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-base sm:text-lg truncate">
                  {user.name || 'Scrollbound Reader'}
                </h3>
                {isAdmin(user.email) && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm opacity-70 truncate font-mono">
                {user.email}
              </p>
              <p className="text-[11px] opacity-50 mt-1">
                Joined: {formatDate(user.createdAt)}
              </p>
            </div>
          </div>

          {/* Quick Library Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-center flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs opacity-60 mb-0.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Library Books</span>
              </div>
              <div className="text-lg font-bold mt-0.5">
                {isLoadingStats ? '...' : (stats?.booksCount ?? '—')}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-center flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs opacity-60 mb-0.5">
                <Bookmark className="w-3.5 h-3.5" />
                <span>Bookmarks</span>
              </div>
              <div className="text-lg font-bold mt-0.5">
                {isLoadingStats ? '...' : (stats?.bookmarksCount ?? '—')}
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="space-y-3 pt-2">
            {isAdmin(user.email) && (
              <Link
                href="/admin"
                onClick={onClose}
                className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white transition flex items-center justify-center gap-2 shadow-sm touch-manipulation cursor-pointer"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Admin Dashboard</span>
              </Link>
            )}

            {/* Log Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isDeleting}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 active:scale-98 transition flex items-center justify-center gap-2 touch-manipulation cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>

          {/* Danger Zone: Delete Account */}
          <div className="pt-3 border-t border-red-500/20">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-red-500/80 mb-2">
              Danger Zone
            </h4>

            {deleteError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                {deleteError}
              </div>
            )}

            {!isConfirmingDelete ? (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isDeleting}
                className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 active:scale-98 transition flex items-center justify-center gap-2 touch-manipulation cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Profile</span>
              </button>
            ) : (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                    <strong className="font-semibold block mb-0.5">
                      Are you absolutely sure?
                    </strong>
                    This will permanently delete your account, all uploaded novel files, reading progress, and custom themes from the database. This action cannot be undone.
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={isDeleting}
                    className="flex-1 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition touch-manipulation cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    disabled={isDeleting}
                    className="flex-1 min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow transition flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Confirm Delete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
