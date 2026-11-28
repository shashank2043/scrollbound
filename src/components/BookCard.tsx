'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, MoreVertical, FilePlus, Split, Trash2 } from 'lucide-react';
import { Book, Progress } from '../lib/types';

interface BookCardProps {
  book: Book;
  progress?: Progress;
  novelProgress?: {
    currentChapter: Book | null;
    chapterPercent: number;
    overallPercent: number;
    currentChapterIndex: number;
    totalChapters: number;
  };
  onAppend: (book: Book) => void;
  onDelete: (book: Book) => void;
  onSplit?: (book: Book) => void;
}

export function BookCard({
  book,
  progress,
  novelProgress,
  onAppend,
  onDelete,
  onSplit,
}: BookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const isChaptered = Boolean(novelProgress?.currentChapter);
  const percent = isChaptered
    ? novelProgress!.overallPercent
    : progress?.percent ?? 0;
  const isStarted = percent > 0 || (isChaptered && novelProgress!.chapterPercent > 0);

  const targetBookId = isChaptered
    ? novelProgress!.currentChapter!.id
    : book.id;

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never read';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="relative rounded-2xl p-5 transition-all duration-200 hover:shadow-lg border flex flex-col justify-between group"
      style={{
        backgroundColor: 'var(--sb-bg)',
        borderColor: 'rgba(128, 128, 128, 0.2)',
      }}
    >
      <div>
        {/* Top bar with menu */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
              aria-label="Book actions menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-56 rounded-xl shadow-xl z-20 py-1.5 border animate-fade-in text-sm font-sans"
                style={{
                  backgroundColor: 'var(--sb-bg)',
                  borderColor: 'rgba(128, 128, 128, 0.25)',
                }}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onAppend(book);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-2.5"
                >
                  <FilePlus className="w-4 h-4 text-blue-500" />
                  <span>Add another PDF to this book</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSplit?.(book);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-2.5"
                >
                  <Split className="w-4 h-4 text-purple-500" />
                  <span>{isChaptered ? 'Re-split Chapters' : 'Split into Chapters'}</span>
                </button>
                <div className="my-1 border-t border-black/5 dark:border-white/5" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(book);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 text-red-600 dark:text-red-400 transition flex items-center gap-2.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete book</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <Link href={`/read/${targetBookId}`} className="block group-hover:underline">
          <h3 className="font-bold text-lg leading-snug line-clamp-2 mb-2 font-serif">
            {book.title}
          </h3>
        </Link>

        {/* Metadata */}
        <div className="text-xs opacity-60 space-y-1 mb-4">
          <div className="flex items-center justify-between">
            <span>
              {book.blockCount.toLocaleString()} blocks
              {isChaptered && ` • ${novelProgress!.totalChapters} chapters`}
            </span>
            <span>{formatDate(book.lastReadAt || book.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div>
        {/* Progress bar */}
        <div className="space-y-1.5 mb-4">
          {isChaptered && novelProgress?.currentChapter ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs opacity-90 font-mono">
                <span className="truncate max-w-[180px] font-semibold text-blue-600 dark:text-blue-400">
                  Ch. {novelProgress.currentChapterIndex + 1}: {Math.round(novelProgress.chapterPercent)}%
                </span>
                <span className="font-semibold">Novel: {Math.round(novelProgress.overallPercent)}%</span>
              </div>
              <div className="text-[11px] opacity-60 truncate">
                {novelProgress.currentChapter.chapterTitle || `Chapter ${novelProgress.currentChapterIndex + 1}`}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs opacity-75 font-mono">
              <span>{isStarted ? `${Math.round(percent)}% read` : 'Unread'}</span>
              {isStarted && progress && (
                <span>Block #{progress.blockId + 1}</span>
              )}
            </div>
          )}
          <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${percent}%`,
                backgroundColor: 'var(--sb-accent, #2563eb)',
              }}
            />
          </div>
        </div>

        {/* Action Button */}
        <Link
          href={`/read/${targetBookId}`}
          className="w-full py-2.5 px-4 rounded-xl text-center text-sm font-semibold transition block shadow-sm hover:shadow active:scale-[0.99]"
          style={{
            backgroundColor: isStarted ? 'var(--sb-accent, #2563eb)' : 'transparent',
            color: isStarted ? '#ffffff' : 'var(--sb-text)',
            border: isStarted ? 'none' : '1px solid rgba(128, 128, 128, 0.3)',
          }}
        >
          {isStarted ? 'Continue Reading' : 'Start Reading'}
        </Link>
      </div>
    </div>
  );
}
