'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Library, BookOpen, Plus, Globe, RefreshCw } from 'lucide-react';
import { Book, Progress } from '../lib/types';
import {
  getAllBooks,
  getAllProgress,
  getPublicBooks,
  toggleBookPublic,
  deleteBook,
  saveBook,
  createChunksFromBlocks,
  getCachedBooks,
  getCachedProgressMap,
  initSyncEngine,
  calculateNovelProgress,
} from '../lib/db';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/admin';
import { LibraryHeader } from '../components/LibraryHeader';
import { BookCard } from '../components/BookCard';
import { AddBookModal } from '../components/AddBookModal';
import { AppendBookModal } from '../components/AppendBookModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { SplitBookModal } from '../components/SplitBookModal';
import { SettingsModal } from '../components/SettingsModal';
import { BackupModal } from '../components/BackupModal';
import { CircularProgress } from '../components/CircularProgress';

export default function LibraryPage() {
  const { user, isLoading: isAuthLoading, openAuthModal } = useAuth();
  const userIsAdmin = isAdmin(user?.email);
  const [isMounted, setIsMounted] = useState(false);

  // Tab state: 'personal' | 'public'
  const [activeTab, setActiveTab] = useState<'personal' | 'public'>('personal');

  // Personal Library state
  const [books, setBooks] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Public Library state
  const [publicBooks, setPublicBooks] = useState<Book[]>([]);
  const [publicProgressMap, setPublicProgressMap] = useState<Record<string, Progress>>({});
  const [isLoadingPublic, setIsLoadingPublic] = useState<boolean>(false);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddPublic, setIsAddPublic] = useState(false);
  const [appendBookTarget, setAppendBookTarget] = useState<Book | null>(null);
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null);
  const [splitBookTarget, setSplitBookTarget] = useState<Book | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  const {
    settings,
    customThemes,
    updateSettings,
    addCustomTheme,
    removeCustomTheme,
  } = useSettings();

  // Load public books
  const loadPublicBooks = useCallback(async () => {
    setIsLoadingPublic(true);
    try {
      const { books: pBooks, progressMap: pMap } = await getPublicBooks();
      setPublicBooks(pBooks);
      setPublicProgressMap(pMap);
    } catch (err) {
      console.error('Failed to load public books:', err);
    } finally {
      setIsLoadingPublic(false);
    }
  }, []);

  // Synchronously load from local cache right after mount (prevents React 418 hydration mismatch)
  useEffect(() => {
    setIsMounted(true);
    const cachedBooks = getCachedBooks();
    const cachedProgress = getCachedProgressMap();
    setBooks(cachedBooks);
    setProgressMap(cachedProgress);
    setIsLoading(cachedBooks.length === 0);

    // Initial public books fetch
    loadPublicBooks();
  }, [loadPublicBooks]);

  const loadData = useCallback(async () => {
    if (!user) {
      setBooks([]);
      setProgressMap({});
      setIsLoading(false);
      return;
    }

    try {
      const [fetchedBooks, fetchedProgress] = await Promise.all([
        getAllBooks(),
        getAllProgress(),
      ]);
      setBooks(fetchedBooks);
      setProgressMap(fetchedProgress);
    } catch (err) {
      console.error('Error loading library books:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initialize sync engine for automatic background retries & reconciliation
  useEffect(() => {
    initSyncEngine();

    const handleRollback = () => {
      loadData();
      loadPublicBooks();
    };
    window.addEventListener('scrollbound_rollback', handleRollback);
    return () => {
      window.removeEventListener('scrollbound_rollback', handleRollback);
    };
  }, [loadData, loadPublicBooks]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;
    Promise.all([getAllBooks(), getAllProgress()])
      .then(([fetchedBooks, fetchedProgress]) => {
        if (isSubscribed) {
          setBooks(fetchedBooks);
          setProgressMap(fetchedProgress);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          console.error('Error loading library books:', err);
          setIsLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [user]);

  const handleBookDeleted = async () => {
    if (!deleteBookTarget) return;
    const targetId = deleteBookTarget.id;
    // Optimistic UI: remove immediately from state and close modal in 0ms
    setBooks((prev) => prev.filter((b) => b.id !== targetId));
    setProgressMap((prev) => {
      const copy = { ...prev };
      delete copy[targetId];
      return copy;
    });
    setDeleteBookTarget(null);

    // Delete from cloud in background
    deleteBook(targetId).catch((err) => {
      console.error('Failed to delete book from database:', err);
      loadData();
    });
  };

  const handleTogglePublic = async (book: Book) => {
    if (!userIsAdmin) return;
    const nextState = !book.isPublic;
    const res = await toggleBookPublic(book.id, nextState);
    if (res.success) {
      loadData();
      loadPublicBooks();
    } else {
      alert(res.error || 'Failed to update public status');
    }
  };

  const handleOpenAddBook = (forPublic = false) => {
    if (!user) {
      openAuthModal('register');
      return;
    }
    setIsAddPublic(forPublic || (activeTab === 'public' && userIsAdmin));
    setIsAddOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200 max-w-full overflow-x-hidden">
      <LibraryHeader
        onAddBook={() => handleOpenAddBook(activeTab === 'public' && userIsAdmin)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        publicCount={publicBooks.filter((b) => !b.parentId).length}
        personalCount={user ? books.filter((b) => !b.parentId).length : undefined}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 max-w-full overflow-x-hidden">
        {activeTab === 'public' ? (
          /* ================= PUBLIC LIBRARY VIEW ================= */
          <div>
            {/* Curated Banner */}
            <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-transparent border border-blue-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                    <Globe className="w-4 h-4" />
                  </div>
                  <h2 className="font-bold text-lg sm:text-xl tracking-tight">
                    Scrollbound Public Library
                  </h2>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                    Curated by Shashank
                  </span>
                </div>
                <p className="text-xs sm:text-sm opacity-75 mt-2 max-w-2xl leading-relaxed">
                  Open access novels curated for the community. Any user can start reading freely with individual progress, bookmarks, and appearance settings saved personally to their account.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => loadPublicBooks()}
                  disabled={isLoadingPublic}
                  className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
                  title="Refresh Public Library"
                  aria-label="Refresh Public Library"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPublic ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>

                {userIsAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddBook(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Upload Public Novel</span>
                  </button>
                )}
              </div>
            </div>

            {isLoadingPublic && publicBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <CircularProgress size={44} strokeWidth={4} label="Loading public library..." />
              </div>
            ) : publicBooks.filter((b) => !b.parentId).length === 0 ? (
              <div className="text-center py-20 px-4 max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm">
                  <Globe className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-2">
                  No Public Novels Yet
                </h3>
                <p className="text-xs opacity-70 mb-6 leading-relaxed">
                  {userIsAdmin
                    ? 'As the administrator, you can upload public novels or publish any existing novel from your personal library.'
                    : 'The public catalog is currently being updated. Check back shortly for new curated web novels!'}
                </p>
                {userIsAdmin && (
                  <button
                    onClick={() => handleOpenAddBook(true)}
                    className="px-5 py-2.5 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow transition inline-flex items-center gap-2 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publish First Public Novel</span>
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold tracking-tight opacity-75">
                    Available Public Novels ({publicBooks.filter((b) => !b.parentId).length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publicBooks
                    .filter((b) => !b.parentId)
                    .map((book) => {
                      const novelProg = calculateNovelProgress(
                        book,
                        publicBooks,
                        publicProgressMap
                      );
                      const isOwner = user?.id && book.userId === user.id;
                      return (
                        <BookCard
                          key={book.id}
                          book={book}
                          progress={publicProgressMap[book.id]}
                          novelProgress={novelProg}
                          isReadOnly={!isOwner}
                          onAppend={isOwner ? (b) => setAppendBookTarget(b) : undefined}
                          onDelete={isOwner ? (b) => setDeleteBookTarget(b) : undefined}
                          onSplit={isOwner ? (b) => setSplitBookTarget(b) : undefined}
                          onTogglePublic={userIsAdmin ? handleTogglePublic : undefined}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ================= PERSONAL LIBRARY VIEW ================= */
          <>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <CircularProgress size={44} strokeWidth={4} label="Loading library..." />
              </div>
            ) : !user ? (
              <div className="text-center py-20 px-4 max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm">
                  <Library className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">
                  Welcome to Scrollbound
                </h2>
                <p className="text-sm opacity-70 mb-8 leading-relaxed">
                  Your personalized cloud reader. Sign in or create an account to start building your personal library across all your devices, or explore curated books in the Public Library.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => openAuthModal('login')}
                    className="px-6 py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setActiveTab('public')}
                    className="px-6 py-3 rounded-xl font-medium border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center justify-center gap-1.5"
                  >
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span>Browse Public Library</span>
                  </button>
                </div>
              </div>
            ) : books.length === 0 ? (
              <div className="text-center py-20 px-4 max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">
                  Your Library is Empty
                </h2>
                <p className="text-sm opacity-70 mb-8 leading-relaxed">
                  Upload your favourite .txt or .pdf web novel or document. Your position, custom themes, and bookmarks will sync seamlessly to your PostgreSQL cloud database.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => handleOpenAddBook(false)}
                    className="px-6 py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition inline-flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Your First Novel</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('public')}
                    className="px-6 py-3 rounded-xl font-medium border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition inline-flex items-center justify-center gap-2"
                  >
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span>Browse Public Library</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold tracking-tight opacity-80">
                    Your Novels ({books.filter((b) => !b.parentId).length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {books
                    .filter((b) => !b.parentId)
                    .map((book) => {
                      const novelProg = calculateNovelProgress(book, books, progressMap);
                      return (
                        <BookCard
                          key={book.id}
                          book={book}
                          progress={progressMap[book.id]}
                          novelProgress={novelProg}
                          onAppend={(b) => setAppendBookTarget(b)}
                          onDelete={(b) => setDeleteBookTarget(b)}
                          onSplit={(b) => setSplitBookTarget(b)}
                          onTogglePublic={userIsAdmin ? handleTogglePublic : undefined}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Add Novel Modal */}
      {isAddOpen && (
        <AddBookModal
          isOpen={isAddOpen}
          defaultPublic={isAddPublic}
          onClose={() => {
            setIsAddOpen(false);
            setIsAddPublic(false);
          }}
          onBookAdded={() => {
            loadData();
            loadPublicBooks();
          }}
        />
      )}

      {/* Split Novel Modal */}
      {splitBookTarget && (
        <SplitBookModal
          book={splitBookTarget}
          isOpen={!!splitBookTarget}
          onClose={() => setSplitBookTarget(null)}
          onChaptersSplit={() => {
            loadData();
            loadPublicBooks();
          }}
        />
      )}

      {/* Append to Book Modal */}
      {appendBookTarget && (
        <AppendBookModal
          book={appendBookTarget}
          isOpen={!!appendBookTarget}
          onClose={() => setAppendBookTarget(null)}
          onBookUpdated={() => {
            loadData();
            loadPublicBooks();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteBookTarget && (
        <DeleteConfirmModal
          book={deleteBookTarget}
          isOpen={!!deleteBookTarget}
          onClose={() => setDeleteBookTarget(null)}
          onConfirm={handleBookDeleted}
        />
      )}

      {/* Appearance Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        customThemes={customThemes}
        onUpdateSettings={updateSettings}
        onAddCustomTheme={addCustomTheme}
        onRemoveCustomTheme={removeCustomTheme}
      />

      {/* Backup and Data Export Modal */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        settings={settings}
        onDataImported={() => {
          loadData();
          loadPublicBooks();
        }}
      />
    </div>
  );
}
