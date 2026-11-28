'use client';

import React, { useState, useRef } from 'react';
import { extractPdfBlocks, ExtractProgress } from '../lib/pdf/extract';
import { saveBook, saveChapteredNovel, createChunksFromBlocks } from '../lib/db';
import { Book, Block } from '../lib/types';
import { CircularProgress } from './CircularProgress';
import {
  ChapterSuggestion,
  detectChapters,
  sliceBlocksForChapters,
} from '../lib/chapterDetector';
import { ChapterSplitReview } from './ChapterSplitReview';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookAdded: (newBook: Book) => void;
}

export function AddBookModal({ isOpen, onClose, onBookAdded }: AddBookModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [extractedBlocks, setExtractedBlocks] = useState<Block[] | null>(null);
  const [initialSuggestions, setInitialSuggestions] = useState<ChapterSuggestion[]>([]);

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
      const defaultTitle = selected.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(defaultTitle);
    }
  };

  const handleStartExtraction = async () => {
    if (!file || !title.trim()) return;

    setIsProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 100, stage: 'loading' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { blocks } = await extractPdfBlocks(arrayBuffer, {
        onProgress: (p) => setProgress(p),
      });

      if (!blocks || blocks.length === 0) {
        throw new Error('No readable text content found in this PDF.');
      }

      const suggestions = detectChapters(blocks);

      setExtractedBlocks(blocks);
      setInitialSuggestions(suggestions);
      setIsProcessing(false);
      setStep('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsProcessing(false);
    }
  };

  const handleConfirmSingle = async () => {
    if (!extractedBlocks || !title.trim()) return;

    setIsProcessing(true);
    setSavingMessage('Saving single continuous novel...');
    setError(null);

    try {
      const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const chunks = createChunksFromBlocks(bookId, extractedBlocks);

      const newBook: Book = {
        id: bookId,
        title: title.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        blockCount: extractedBlocks.length,
        chunkCount: chunks.length,
      };

      await saveBook(newBook, chunks);
      onBookAdded(newBook);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsProcessing(false);
      setSavingMessage(null);
    }
  };

  const handleConfirmSplit = async (finalSuggestions: ChapterSuggestion[]) => {
    if (!extractedBlocks || !title.trim()) return;

    setIsProcessing(true);
    setSavingMessage(`Saving novel and ${finalSuggestions.length} chapters...`);
    setError(null);

    try {
      const sliced = sliceBlocksForChapters(extractedBlocks, finalSuggestions);
      const chapterInputs = sliced.map((s) => ({
        title: s.chapter.title,
        blocks: s.blocks,
      }));

      const { parent } = await saveChapteredNovel(title.trim(), chapterInputs);
      onBookAdded(parent);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsProcessing(false);
      setSavingMessage(null);
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
        className="w-full max-w-xl rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">
              {step === 'upload' ? 'Add New Book' : 'Organize Novel Chapters'}
            </h2>
            {step === 'review' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                Step 2 of 2
              </span>
            )}
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
              <div className="font-semibold mb-1">Import Error</div>
              {error}
            </div>
          )}

          {isProcessing ? (
            /* Progress view */
            <div className="py-6 text-center space-y-4">
              <CircularProgress
                progress={calculatePercent()}
                size={72}
                strokeWidth={5}
                label={
                  savingMessage
                    ? savingMessage
                    : progress?.stage === 'loading'
                    ? 'Opening PDF document...'
                    : progress?.stage === 'extracting'
                    ? `Extracting page ${progress.current} of ${progress.total}...`
                    : 'Reflowing text into clean blocks...'
                }
                sublabel="PDF is parsed in memory and immediately discarded. No heavy files are uploaded."
              />

              <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2.5 overflow-hidden mt-3">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${savingMessage ? 100 : calculatePercent()}%` }}
                />
              </div>
            </div>
          ) : step === 'upload' ? (
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
                        Text will be extracted and reflowed. You can split into chapters next.
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
            /* Review and split step */
            extractedBlocks && (
              <ChapterSplitReview
                blocks={extractedBlocks}
                initialSuggestions={initialSuggestions}
                onConfirmSingle={handleConfirmSingle}
                onConfirmSplit={handleConfirmSplit}
                onBack={() => setStep('upload')}
              />
            )
          )}
        </div>

        {/* Modal actions for Step 1 */}
        {!isProcessing && step === 'upload' && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10 dark:border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleStartExtraction}
              disabled={!file || !title.trim()}
              className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            >
              Continue to Chapters →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
