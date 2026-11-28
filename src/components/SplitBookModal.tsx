'use client';

import React, { useState, useEffect } from 'react';
import { Book, Block } from '../lib/types';
import {
  ChapterSuggestion,
  detectChapters,
} from '../lib/chapterDetector';
import { getAllBlocksForBook, splitExistingBook } from '../lib/db';
import { ChapterSplitReview } from './ChapterSplitReview';
import { CircularProgress } from './CircularProgress';

interface SplitBookModalProps {
  isOpen: boolean;
  book: Book | null;
  onClose: () => void;
  onChaptersSplit: () => void;
}

export function SplitBookModal({
  isOpen,
  book,
  onClose,
  onChaptersSplit,
}: SplitBookModalProps) {
  const [isLoadingBlocks, setIsLoadingBlocks] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [initialSuggestions, setInitialSuggestions] = useState<ChapterSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !book) {
      setBlocks(null);
      setInitialSuggestions([]);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingBlocks(true);
    setError(null);

    getAllBlocksForBook(book.id)
      .then((loadedBlocks) => {
        if (!isMounted) return;
        if (!loadedBlocks || loadedBlocks.length === 0) {
          throw new Error('No readable text blocks found in this novel.');
        }

        const suggestions = detectChapters(loadedBlocks);
        setBlocks(loadedBlocks);
        setInitialSuggestions(suggestions);
        setIsLoadingBlocks(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setIsLoadingBlocks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, book]);

  if (!isOpen || !book) return null;

  const handleConfirmSplit = async (finalSuggestions: ChapterSuggestion[]) => {
    if (!blocks || !book) return;

    setIsSaving(true);
    setError(null);

    try {
      await splitExistingBook(book, blocks, finalSuggestions);
      onChaptersSplit();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className="w-full max-w-xl rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Split Novel into Chapters</h2>
            <div className="text-xs opacity-60 truncate max-w-sm font-serif">
              {book.title}
            </div>
          </div>
          {!isSaving && !isLoadingBlocks && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1 rounded"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        <div className="py-5 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm leading-relaxed">
              <div className="font-semibold mb-1">Splitting Error</div>
              {error}
            </div>
          )}

          {isLoadingBlocks ? (
            <div className="py-12 text-center">
              <CircularProgress
                size={56}
                strokeWidth={4}
                label="Retrieving novel blocks..."
                sublabel="Loading stored text content to analyze chapter headings..."
              />
            </div>
          ) : isSaving ? (
            <div className="py-12 text-center">
              <CircularProgress
                size={56}
                strokeWidth={4}
                label="Splitting novel into chapters..."
                sublabel="Creating linked chapter records and migrating reading progress..."
              />
            </div>
          ) : (
            blocks && (
              <ChapterSplitReview
                blocks={blocks}
                initialSuggestions={initialSuggestions}
                onConfirmSingle={onClose}
                onConfirmSplit={handleConfirmSplit}
                onBack={onClose}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
