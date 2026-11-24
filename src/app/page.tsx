'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Book, Progress } from '../lib/types';
import { getAllBooks, getAllProgress, deleteBook, saveBook, createChunksFromBlocks } from '../lib/db';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { LibraryHeader } from '../components/LibraryHeader';
import { BookCard } from '../components/BookCard';
import { AddBookModal } from '../components/AddBookModal';
import { AppendBookModal } from '../components/AppendBookModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { SettingsModal } from '../components/SettingsModal';
import { BackupModal } from '../components/BackupModal';

export default function LibraryPage() {
  const { user, isLoading: isAuthLoading, openAuthModal } = useAuth();

  const [books, setBooks] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    if (!user) {
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
    await deleteBook(deleteBookTarget.id);
    setDeleteBookTarget(null);
    loadData();
  };

  const handleOpenAddBook = () => {
    if (!user) {
      openAuthModal('register');
      return;
    }
    setIsAddOpen(true);
  };

  // Pre-load a sample classic if user wants an instant preview
  const handleLoadSample = async () => {
    if (!user) {
      openAuthModal('register');
      return;
    }

    setIsLoading(true);
    const sampleId = 'sample_alice_' + Date.now();
    const sampleBlocks = [
      { id: 0, type: 'heading' as const, text: 'CHAPTER I. Down the Rabbit-Hole' },
      {
        id: 1,
        type: 'paragraph' as const,
        text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”',
      },
      {
        id: 2,
        type: 'paragraph' as const,
        text: 'So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
      },
      {
        id: 3,
        type: 'paragraph' as const,
        text: 'There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.',
      },
      {
        id: 4,
        type: 'paragraph' as const,
        text: 'In another moment down went Alice after it, never once considering in the world how in the world she was to get out again.',
      },
      {
        id: 5,
        type: 'paragraph' as const,
        text: 'The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well.',
      },
      {
        id: 6,
        type: 'heading' as const,
        text: 'CHAPTER II. The Pool of Tears'
      },
      {
        id: 7,
        type: 'paragraph' as const,
        text: '“Curiouser and curiouser!” cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); “now I’m opening out like the largest telescope that ever was! Good-bye, feet!” (for when she looked down at her feet, they seemed to be almost out of sight, they were getting so far off).',
      },
    ];

    const chunks = createChunksFromBlocks(sampleId, sampleBlocks);
    const sampleBook: Book = {
      id: sampleId,
      title: "Alice's Adventures in Wonderland (Sample Excerpt)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockCount: sampleBlocks.length,
      chunkCount: chunks.length,
    };

    await saveBook(sampleBook, chunks);
    await loadData();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <LibraryHeader
        onAddBook={handleOpenAddBook}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8">
        {/* PostgreSQL & Auth Banner if not signed in */}
        {!isAuthLoading && !user && (
          <div className="mb-8 p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-600 dark:text-blue-400">
                <span>🐘</span>
                <span>PostgreSQL Database Storage Active</span>
              </div>
              <p className="text-xs opacity-75 max-w-xl leading-relaxed">
                Scrollbound now stores all books, reading progress, and bookmarks in your local PostgreSQL database. Create an account or sign in to save and access your novel library.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => openAuthModal('login')}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-white shadow transition"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {isLoading || isAuthLoading ? (
          <div className="py-24 text-center">
            <div className="inline-block animate-spin text-3xl mb-3">⏳</div>
            <div className="text-sm opacity-60">Loading from PostgreSQL database...</div>
          </div>
        ) : !user ? (
          /* Unauthenticated State */
          <div className="py-16 sm:py-24 text-center max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl shadow-sm border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              🐘
            </div>
            <h2 className="text-2xl font-bold font-serif mb-3 tracking-tight">
              Welcome to Scrollbound
            </h2>
            <p className="text-sm opacity-70 mb-8 leading-relaxed">
              Sign in or create an account to start uploading PDF novels. Your library, reading position, and bookmarks will be securely stored in your local PostgreSQL database.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => openAuthModal('register')}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl font-semibold text-white shadow hover:shadow-md transition active:scale-95 flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                <span>🚀</span>
                <span>Create Free Account</span>
              </button>

              <button
                onClick={() => openAuthModal('login')}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl font-medium border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition text-sm"
              >
                Sign In
              </button>
            </div>
          </div>
        ) : books.length === 0 ? (
          /* Empty State for Logged-In User */
          <div className="py-16 sm:py-24 text-center max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl shadow-sm border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              📚
            </div>
            <h2 className="text-2xl font-bold font-serif mb-3 tracking-tight">
              Your Library is Empty
            </h2>
            <p className="text-sm opacity-70 mb-8 leading-relaxed">
              Import a PDF novel to read it as clean, reflowable, distraction-free text. Extracted blocks are stored in PostgreSQL; original PDFs are parsed in memory and never saved.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setIsAddOpen(true)}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl font-semibold text-white shadow hover:shadow-md transition active:scale-95 flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                <span>➕</span>
                <span>Import a PDF Novel</span>
              </button>

              <button
                onClick={handleLoadSample}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl font-medium border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition text-sm"
              >
                Load Sample Novel Excerpt
              </button>
            </div>
          </div>
        ) : (
          /* Book Grid */
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm opacity-60">
                {books.length} {books.length === 1 ? 'novel' : 'novels'} stored in PostgreSQL
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progressMap[book.id]}
                  onAppend={(b) => setAppendBookTarget(b)}
                  onDelete={(b) => setDeleteBookTarget(b)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddBookModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onBookAdded={() => loadData()}
      />

      <AppendBookModal
        book={appendBookTarget}
        isOpen={!!appendBookTarget}
        onClose={() => setAppendBookTarget(null)}
        onBookUpdated={() => loadData()}
      />

      <DeleteConfirmModal
        book={deleteBookTarget}
        isOpen={!!deleteBookTarget}
        onClose={() => setDeleteBookTarget(null)}
        onConfirm={handleBookDeleted}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        customThemes={customThemes}
        onUpdateSettings={updateSettings}
        onAddCustomTheme={addCustomTheme}
        onRemoveCustomTheme={removeCustomTheme}
      />

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        settings={settings}
        onDataImported={() => loadData()}
      />
    </div>
  );
}
