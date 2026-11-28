'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { Book, Bookmark } from '../../../lib/types';
import {
  getBook,
  getBookmarks,
  addBookmark,
  deleteBookmark,
  updateBookmarkNote,
  getCachedBooks,
  getLocalBookmarks,
  initSyncEngine,
} from '../../../lib/db';
import { useProgress } from '../../../hooks/useProgress';
import { useSettings } from '../../../hooks/useSettings';
import { ReaderToolbar } from '../../../components/ReaderToolbar';
import { ReaderContent } from '../../../components/ReaderContent';
import { BookmarksDrawer } from '../../../components/BookmarksDrawer';
import { SettingsModal } from '../../../components/SettingsModal';
import { CircularProgress } from '../../../components/CircularProgress';

interface PageProps {
  params: Promise<{ bookId: string }>;
}

function ReaderView({ params }: { params: Promise<{ bookId: string }> }) {
  const resolvedParams = use(params);
  const bookId = resolvedParams.bookId;

  // Hydration-safe state (matches server SSR, avoids React 418 error)
  const [book, setBook] = useState<Book | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoadingBook, setIsLoadingBook] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = getCachedBooks().find((b) => b.id === bookId) || null;
    if (cached) {
      setBook(cached);
      setIsLoadingBook(false);
    }
    setBookmarks(getLocalBookmarks(bookId));
  }, [bookId]);

  // Panels
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [jumpToBlockId, setJumpToBlockId] = useState<number | null>(null);

  const {
    settings,
    customThemes,
    updateSettings,
    addCustomTheme,
    removeCustomTheme,
  } = useSettings();

  useEffect(() => {
    initSyncEngine();

    const handleRollback = () => {
      setBookmarks(getLocalBookmarks(bookId));
    };
    window.addEventListener('scrollbound_rollback', handleRollback);
    return () => {
      window.removeEventListener('scrollbound_rollback', handleRollback);
    };
  }, [bookId]);

  // Background sync with database for fresh book details & bookmarks
  useEffect(() => {
    let isMounted = true;
    Promise.all([getBook(bookId), getBookmarks(bookId)])
      .then(([b, bms]) => {
        if (!isMounted) return;
        if (!b) {
          setError('Book not found in library.');
        } else {
          setBook(b);
          setBookmarks(bms);
        }
        setIsLoadingBook(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setIsLoadingBook(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  const {
    progress,
    currentBlockId,
    percent,
    isRestored,
    updatePosition,
    flushProgress,
  } = useProgress(bookId, book?.blockCount ?? 0);

  // Optimistic bookmark actions (0ms instant UI update with background cloud sync)
  const handleAddBookmark = async (blockId: number, snippet: string, note?: string) => {
    const newBm: Bookmark = {
      id: 'bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      bookId,
      blockId,
      snippet: snippet.slice(0, 100),
      note,
      createdAt: Date.now(),
    };
    setBookmarks((prev) => [...prev, newBm]);
    addBookmark(newBm);
  };

  const handleDeleteBookmark = async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    deleteBookmark(id, bookId);
  };

  const handleUpdateNote = async (id: string, note: string) => {
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, note } : b))
    );
    updateBookmarkNote(id, note, bookId);
  };

  const handleToggleBookmark = async (blockId: number, text: string) => {
    const existing = bookmarks.find((b) => b.blockId === blockId);
    if (existing) {
      await handleDeleteBookmark(existing.id);
    } else {
      await handleAddBookmark(blockId, text.slice(0, 100));
    }
  };

  if (isLoadingBook) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <CircularProgress size={48} strokeWidth={4} label="Opening novel..." />
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans">
        <div className="text-center max-w-md space-y-4">
          <div className="text-4xl">📚</div>
          <h2 className="text-xl font-bold">Book Not Found</h2>
          <p className="text-sm opacity-70">
            {error || 'This book does not exist in your local library or may have been deleted.'}
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl font-semibold text-white shadow"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          >
            ← Return to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative font-sans selection:bg-blue-500/20 max-w-full overflow-x-hidden">
      {/* Floating Toolbar with Auto-Hide & Progress Bar */}
      <ReaderToolbar
        title={book.title}
        percent={percent}
        bookmarkCount={bookmarks.length}
        chapterTitle={book.chapterTitle}
        chapterIndex={book.chapterIndex}
        totalChapters={book.totalChapters}
        prevBookId={book.prevBookId}
        nextBookId={book.nextBookId}
        onOpenBookmarks={() => setIsBookmarksOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeave={flushProgress}
      />

      {/* Main Virtualized / Lazy Scroll Reader */}
      {isRestored && (
        <ReaderContent
          book={book}
          initialProgress={progress}
          bookmarks={bookmarks}
          settings={settings}
          onPositionChange={updatePosition}
          onToggleBookmark={handleToggleBookmark}
          jumpToBlockId={jumpToBlockId}
          onJumpHandled={() => setJumpToBlockId(null)}
        />
      )}

      {/* Bookmarks Drawer */}
      <BookmarksDrawer
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        bookmarks={bookmarks}
        currentBlockId={currentBlockId}
        onAddBookmark={handleAddBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onUpdateNote={handleUpdateNote}
        onJumpToBlock={(blockId) => setJumpToBlockId(blockId)}
      />

      {/* Appearance Settings Modal */}
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
    </div>
  );
}

export default function ReaderPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <CircularProgress size={48} strokeWidth={4} label="Loading reader..." />
          </div>
        </div>
      }
    >
      <ReaderView params={params} />
    </Suspense>
  );
}
