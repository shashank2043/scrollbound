'use client';

import React, { useState, useRef } from 'react';
import { extractPdfBlocks, ExtractProgress } from '../lib/pdf/extract';
import { appendToBook } from '../lib/db';
import { Book } from '../lib/types';
import { CircularProgress } from './CircularProgress';

interface AppendBookModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onBookUpdated: (updatedBook: Book) => void;
}

export function AppendBookModal({
  book,
  isOpen,
  onClose,
  onBookUpdated,
}: AppendBookModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dividerTitle, setDividerTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !book) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
        setError('Please select a valid PDF file.');
        return;
      }
      setFile(selected);
      // Default divider title to file name
      const defaultDivider = selected.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setDividerTitle(defaultDivider);
    }
  };

  const handleAppend = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 100, stage: 'loading' });

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Extract new PDF blocks, continuing ID sequence
      const startId = book.blockCount + (dividerTitle.trim() ? 1 : 0);
      const { blocks } = await extractPdfBlocks(arrayBuffer, {
        startBlockId: startId,
        onProgress: (p) => setProgress(p),
      });

      // Append to IndexedDB
      const updated = await appendToBook(book.id, blocks, dividerTitle);

      onBookUpdated(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsProcessing(false);
    }
  };

  const calculatePercent = () => {
    if (!progress || progress.total === 0) return 0;
    if (progress.stage === 'loading') return 5;
    if (progress.stage === 'reflowing') return 95;
    return Math.min(90, Math.round((progress.current / progress.total) * 90));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Add Another PDF to Book</h2>
            <div className="text-xs opacity-70 truncate max-w-sm mt-0.5">
              Appending to: <span className="font-semibold">{book.title}</span>
            </div>
          </div>
          {!isProcessing && (
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
              <div className="font-semibold mb-1">Append Failed</div>
              {error}
            </div>
          )}

          {!isProcessing ? (
            <>
              {/* File selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5 opacity-80">
                  Select Additional PDF (Part 2, Next Volume, etc.)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div>
                      <div className="text-3xl mb-1">📄</div>
                      <div className="font-medium text-sm truncate max-w-sm mx-auto">
                        {file.name}
                      </div>
                      <div className="text-xs opacity-60 mt-0.5">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to change
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-3xl mb-1 opacity-70">➕</div>
                      <div className="font-medium text-sm">Pick the PDF to append</div>
                      <div className="text-xs opacity-60 mt-1">
                        Blocks will be appended after existing content. Existing bookmarks and progress remain valid.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider Heading */}
              {file && (
                <div>
                  <label className="block text-sm font-medium mb-1.5 opacity-80">
                    Divider Heading (optional)
                  </label>
                  <input
                    type="text"
                    value={dividerTitle}
                    onChange={(e) => setDividerTitle(e.target.value)}
                    placeholder="e.g. Volume 2 or Chapter 10"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <div className="text-xs opacity-50 mt-1">
                    Inserts a heading block between the existing content and the new content.
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Progress view */
            <div className="py-6 text-center space-y-4">
              <CircularProgress
                progress={calculatePercent()}
                size={72}
                strokeWidth={5}
                label={
                  progress?.stage === 'loading'
                    ? 'Opening additional PDF...'
                    : progress?.stage === 'extracting'
                    ? `Extracting page ${progress.current} of ${progress.total}...`
                    : 'Reflowing and appending blocks...'
                }
                sublabel="Existing progress and bookmarks are preserved."
              />

              <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2.5 overflow-hidden mt-3">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${calculatePercent()}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {!isProcessing && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10 dark:border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAppend}
              disabled={!file}
              className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            >
              Append to Book
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
