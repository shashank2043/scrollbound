'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Globe,
  BookOpen,
  Bookmark,
  Activity,
  ArrowLeft,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isAdmin } from '@/lib/admin';
import { AdminDashboardData } from '@/lib/types';
import { CircularProgress } from '@/components/CircularProgress';

export default function AdminDashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'books' | 'activity'>('users');

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access Restricted: Only the admin (shashankpulluri1@gmail.com) can access this dashboard.');
        } else {
          setError('Failed to fetch admin statistics.');
        }
        return;
      }
      const json: AdminDashboardData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && user && isAdmin(user.email)) {
      fetchStats();
    } else if (!isAuthLoading && (!user || !isAdmin(user?.email))) {
      setIsLoading(false);
    }
  }, [isAuthLoading, user, fetchStats]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <CircularProgress size={44} strokeWidth={4} label="Verifying admin credentials..." />
      </div>
    );
  }

  // Restrict view if not logged in or not admin
  if (!user || !isAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="max-w-md w-full p-8 rounded-2xl shadow-xl border text-center space-y-4"
          style={{
            backgroundColor: 'var(--sb-bg)',
            borderColor: 'rgba(128, 128, 128, 0.2)',
          }}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Admin Authorization Required</h2>
          <p className="text-xs opacity-75 leading-relaxed">
            This analytics dashboard is strictly restricted to Shashank (<strong className="font-semibold text-blue-600 dark:text-blue-400">shashankpulluri1@gmail.com</strong>). Please sign in with the admin email to inspect usage statistics.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Library</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = (data?.users || []).filter(
    (u) =>
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const formatRelativeTime = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    try {
      const ms = Date.now() - new Date(isoStr).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200">
      {/* Top Header */}
      <header className="border-b border-black/10 dark:border-white/10 px-4 sm:px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 border border-black/10 dark:border-white/10 transition"
              title="Return to Library"
              aria-label="Return to Library"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                  Admin Dashboard & Analytics
                </h1>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Super Admin
                </span>
              </div>
              <p className="text-xs opacity-60">
                Logged in as {user.email} • Real-time user metrics & usage analytics
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchStats}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8">
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* KPI Statistics Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Total Registered Users */}
          <div
            className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>Total Users</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono">
              {isLoading ? '...' : (data?.totalUsers ?? 0)}
            </div>
            <div className="text-[11px] opacity-50 mt-1">Registered readers</div>
          </div>

          {/* Public Library Novels */}
          <div
            className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>Public Novels</span>
              <Globe className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono text-emerald-600 dark:text-emerald-400">
              {isLoading ? '...' : (data?.totalPublicBooks ?? 0)}
            </div>
            <div className="text-[11px] opacity-50 mt-1">Curated by you</div>
          </div>

          {/* Private Novels */}
          <div
            className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>User Uploads</span>
              <BookOpen className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono">
              {isLoading ? '...' : (data?.totalPrivateBooks ?? 0)}
            </div>
            <div className="text-[11px] opacity-50 mt-1">Private novels</div>
          </div>

          {/* Reading Sessions */}
          <div
            className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>Reading Sessions</span>
              <TrendingUp className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono">
              {isLoading ? '...' : (data?.totalReadingSessions ?? 0)}
            </div>
            <div className="text-[11px] opacity-50 mt-1">Active progress records</div>
          </div>

          {/* Total Bookmarks */}
          <div
            className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>Bookmarks Saved</span>
              <Bookmark className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono">
              {isLoading ? '...' : (data?.totalBookmarks ?? 0)}
            </div>
            <div className="text-[11px] opacity-50 mt-1">Across all users</div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center border-b border-black/10 dark:border-white/10 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Accounts ({data?.users.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('books')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'books'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Public Novels Performance ({data?.publicBooks.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'activity'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Activity Stream</span>
          </button>
        </div>

        {/* Tab 1: Users & Readers Table */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-50" />
                <input
                  type="text"
                  placeholder="Search user by email or name..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="text-xs opacity-60">
                Showing {filteredUsers.length} of {data?.users.length ?? 0} users
              </div>
            </div>

            <div
              className="rounded-2xl border overflow-hidden shadow-sm overflow-x-auto"
              style={{
                backgroundColor: 'var(--sb-bg)',
                borderColor: 'rgba(128, 128, 128, 0.2)',
              }}
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 uppercase tracking-wider text-[10px] opacity-75">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Joined Date</th>
                    <th className="py-3 px-4 text-center">Uploaded Books</th>
                    <th className="py-3 px-4 text-center">Books Read</th>
                    <th className="py-3 px-4 text-center">Bookmarks</th>
                    <th className="py-3 px-4">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center opacity-60">
                        No users match your search query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.email === user.email;
                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-sm truncate max-w-[200px]">
                              {u.name || u.email.split('@')[0]}
                              {isSelf && (
                                <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  You (Admin)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] opacity-60 font-mono truncate max-w-[200px]">
                              {u.email}
                            </div>
                          </td>
                          <td className="py-3 px-4 opacity-75 whitespace-nowrap">
                            {formatDate(u.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium">
                            {u.bookCount}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-blue-600 dark:text-blue-400">
                            {u.readingCount}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-amber-600 dark:text-amber-400">
                            {u.bookmarkCount}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="flex items-center gap-1.5 text-[11px] opacity-75">
                              <Clock className="w-3 h-3 opacity-50" />
                              <span>{formatRelativeTime(u.lastActive)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Public Novels Analytics Table */}
        {activeTab === 'books' && (
          <div className="space-y-4">
            <div
              className="rounded-2xl border overflow-hidden shadow-sm overflow-x-auto"
              style={{
                backgroundColor: 'var(--sb-bg)',
                borderColor: 'rgba(128, 128, 128, 0.2)',
              }}
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 uppercase tracking-wider text-[10px] opacity-75">
                  <tr>
                    <th className="py-3 px-4">Public Novel</th>
                    <th className="py-3 px-4">Published</th>
                    <th className="py-3 px-4 text-center">Structure</th>
                    <th className="py-3 px-4 text-center">Active Readers</th>
                    <th className="py-3 px-4">Avg Reader Completion</th>
                    <th className="py-3 px-4 text-center">Bookmarks</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {(data?.publicBooks || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center opacity-60">
                        No public novels have been published yet.
                      </td>
                    </tr>
                  ) : (
                    data?.publicBooks.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-sm line-clamp-1 max-w-[260px]">
                            {b.title}
                          </div>
                          <div className="text-[10px] opacity-50 font-mono">
                            ID: {b.id}
                          </div>
                        </td>
                        <td className="py-3 px-4 opacity-75 whitespace-nowrap">
                          {formatDate(b.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {b.totalChapters ? (
                            <span className="flex items-center justify-center gap-1">
                              <Layers className="w-3 h-3 text-purple-500" />
                              <span>{b.totalChapters} Chaps</span>
                            </span>
                          ) : (
                            <span className="opacity-70">{b.blockCount} Blocks</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {b.readersCount}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all"
                                style={{ width: `${b.avgProgress}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-semibold">
                              {b.avgProgress}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-amber-600 dark:text-amber-400">
                          {b.bookmarksCount}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/read/${b.id}`}
                            className="inline-block px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-600/10 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-blue-400 transition"
                          >
                            Read
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Live Reading Activity Stream */}
        {activeTab === 'activity' && (
          <div
            className="rounded-2xl border p-5 shadow-sm space-y-4"
            style={{
              backgroundColor: 'var(--sb-bg)',
              borderColor: 'rgba(128, 128, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Recent Platform Reading Activity</h3>
              <span className="text-xs opacity-50 font-mono">Latest 25 events</span>
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5 space-y-2">
              {(data?.recentActivity || []).length === 0 ? (
                <div className="py-8 text-center opacity-60 text-xs">
                  No recent reading sessions recorded yet.
                </div>
              ) : (
                data?.recentActivity.map((act) => (
                  <div
                    key={act.id}
                    className="pt-2.5 flex items-center justify-between text-xs gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0">
                        {(act.userName || act.userEmail)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <span className="font-semibold">{act.userName}</span>{' '}
                          <span className="opacity-60 text-[11px]">({act.userEmail})</span>
                        </div>
                        <div className="text-[11px] opacity-70 truncate font-serif">
                          Reading: <span className="font-semibold">{act.bookTitle}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                        {act.percent}% finished
                      </span>
                      <span className="text-[10px] opacity-50 whitespace-nowrap font-mono">
                        {formatRelativeTime(act.updatedAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
