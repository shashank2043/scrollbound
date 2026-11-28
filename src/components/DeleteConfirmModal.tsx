'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { Book } from '../lib/types';

interface DeleteConfirmModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  book,
  isOpen,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen || !book) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Delete Book</h3>
          <p className="text-sm opacity-70 mt-2 px-2">
            Are you sure you want to delete <span className="font-semibold text-black dark:text-white">“{book.title}”</span>?
          </p>
          <p className="text-xs text-red-500/80 mt-1">
            This will remove all extracted text chunks, reading progress, and bookmarks. This cannot be undone.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-5 mt-3 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition shadow"
          >
            Delete Book
          </button>
        </div>
      </div>
    </div>
  );
}
