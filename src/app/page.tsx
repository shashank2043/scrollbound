'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Book, Progress } from '../lib/types';
import {
  getAllBooks,
  getAllProgress,
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
import { LibraryHeader } from '../components/LibraryHeader';
import { BookCard } from '../components/BookCard';
import { AddBookModal } from '../components/AddBookModal';
import { AppendBookModal } from '../components/AppendBookModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { SettingsModal } from '../components/SettingsModal';
import { BackupModal } from '../components/BackupModal';
import { CircularProgress } from '../components/CircularProgress';

export default function LibraryPage() {
  const { user, isLoading: isAuthLoading, openAuthModal } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  // Hydration-safe initial state (matches server SSR 100%)
  const [books, setBooks] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronously load from local cache right after mount (prevents React 418 hydration mismatch)
  useEffect(() => {
    setIsMounted(true);
    const cachedBooks = getCachedBooks();
    const cachedProgress = getCachedProgressMap();
    setBooks(cachedBooks);
    setProgressMap(cachedProgress);
    setIsLoading(cachedBooks.length === 0);
  }, []);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [appendBookTarget, setAppendBookTarget] = useState<Book | null>(null);
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  const {
    settings,
    customThemes,
    updateSettings,
    addCustomTheme,
    removeCustomTheme,
  } = useSettings();

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
    };
    window.addEventListener('scrollbound_rollback', handleRollback);
    return () => {
      window.removeEventListener('scrollbound_rollback', handleRollback);
    };
  }, [loadData]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    Promise.all([getAllBooks(), getAllProgress()])
      .then(([fetchedBooks, fetchedProgress]) => {
        if (isMounted) {
          setBooks(fetchedBooks);
          setProgressMap(fetchedProgress);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Error loading library books:', err);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
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

  const handleOpenAddBook = () => {
    if (!user) {
      openAuthModal('register');
      return;
    }
    setIsAddOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200 max-w-full overflow-x-hidden">
      <LibraryHeader
        onAddBook={handleOpenAddBook}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 max-w-full overflow-x-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <CircularProgress size={44} strokeWidth={4} label="Loading library..." />
          </div>
        ) : !user ? (
          <div className="text-center py-20 px-4 max-w-md mx-auto">
            <div className="text-6xl mb-6 select-none">📚</div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Welcome to Scrollbound
            </h2>
            <p className="text-sm opacity-70 mb-8 leading-relaxed">
              Your personalized cloud reader. Sign in or create an account to start building your library across all your devices.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => openAuthModal('login')}
                className="px-6 py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-6 py-3 rounded-xl font-medium border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Create Free Account
              </button>
            </div>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20 px-4 max-w-md mx-auto">
            <div className="text-6xl mb-6 select-none">📖</div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Your Library is Empty
            </h2>
            <p className="text-sm opacity-70 mb-8 leading-relaxed">
              Upload your favourite .txt or .pdf web novel or document. Your position, custom themes, and bookmarks will sync seamlessly to your PostgreSQL cloud database.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-6 py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition inline-flex items-center gap-2"
            >
              <span>➕</span>
              <span>Add Your First Novel</span>
            </button>
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
                    />
                  );
                })}
            </div>
          </div>
        )}
      </main>

      {/* Add Novel Modal */}
      {isAddOpen && (
        <AddBookModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onBookAdded={() => loadData()}
        />
      )}

      {/* Append to Book Modal */}
      {appendBookTarget && (
        <AppendBookModal
          book={appendBookTarget}
          isOpen={!!appendBookTarget}
          onClose={() => setAppendBookTarget(null)}
          onBookUpdated={() => loadData()}
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

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          customThemes={customThemes}
          onUpdateSettings={updateSettings}
          onAddCustomTheme={addCustomTheme}
          onRemoveCustomTheme={removeCustomTheme}
        />
      )}

      {/* Backup & Restore Modal */}
      {isBackupOpen && (
        <BackupModal
          isOpen={isBackupOpen}
          onClose={() => setIsBackupOpen(false)}
          settings={settings}
          onDataImported={() => loadData()}
        />
      )}
    </div>
  );
}
