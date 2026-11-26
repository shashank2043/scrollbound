'use client';

import React, { useState, useRef } from 'react';
import { extractPdfBlocks, ExtractProgress } from '../lib/pdf/extract';
import { saveBook, createChunksFromBlocks } from '../lib/db';
import { Book } from '../lib/types';
import { CircularProgress } from './CircularProgress';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookAdded: (newBook: Book) => void;
}

export function AddBookModal({ isOpen, onClose, onBookAdded }: AddBookModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
        setError('Please select a valid PDF file.');
        return;
      }
      setFile(selected);
      // Default title to filename without extension
      const defaultTitle = selected.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(defaultTitle);
    }
  };

  const handleImport = async () => {
    if (!file || !title.trim()) return;

    setIsProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 100, stage: 'loading' });

    try {
      // 1. Read file into memory ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // 2. Extract and reflow into blocks page-by-page
      const { blocks } = await extractPdfBlocks(arrayBuffer, {
        onProgress: (p) => setProgress(p),
      });

      // 3. Immediately discard raw PDF buffer from memory
      // Prepare Book record & Chunks
      const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const chunks = createChunksFromBlocks(bookId, blocks);

      const newBook: Book = {
        id: bookId,
        title: title.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        blockCount: blocks.length,
        chunkCount: chunks.length,
      };

      // 4. Save to IndexedDB
      await saveBook(newBook, chunks);

      onBookAdded(newBook);
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
          <h2 className="text-xl font-bold tracking-tight">Add New Book</h2>
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
              <div className="font-semibold mb-1">Import Failed</div>
              {error}
            </div>
          )}

          {!isProcessing ? (
            <>
              {/* File selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5 opacity-80">
                  Select PDF Novel
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
                      <div className="text-3xl mb-1 opacity-70">📖</div>
                      <div className="font-medium text-sm">
                        Click or drag a PDF novel here
                      </div>
                      <div className="text-xs opacity-60 mt-1">
                        Text will be extracted and reflowed. The original PDF is never stored.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Title Input */}
              {file && (
                <div>
                  <label className="block text-sm font-medium mb-1.5 opacity-80">
                    Book Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. War and Peace"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
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
                    ? 'Opening PDF document...'
                    : progress?.stage === 'extracting'
                    ? `Extracting page ${progress.current} of ${progress.total}...`
                    : 'Reflowing text into clean blocks...'
                }
                sublabel="Processes in background. PDF is parsed in memory and immediately discarded."
              />

              {/* Progress bar */}
              <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2.5 overflow-hidden mt-3">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${calculatePercent()}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal actions */}
        {!isProcessing && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10 dark:border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!file || !title.trim()}
              className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            >
              Import Book
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
