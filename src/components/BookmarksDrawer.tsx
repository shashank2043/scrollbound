'use client';

import React, { useState } from 'react';
import { Bookmark as BookmarkIcon, X, Pin, BookmarkPlus, FileText, Trash2 } from 'lucide-react';
import { Bookmark } from '../lib/types';

interface BookmarksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  currentBlockId: number;
  currentSnippet?: string;
  onAddBookmark: (blockId: number, snippet: string, note?: string) => Promise<void>;
  onDeleteBookmark: (id: string) => Promise<void>;
  onUpdateNote: (id: string, note: string) => Promise<void>;
  onJumpToBlock: (blockId: number) => void;
}

export function BookmarksDrawer({
  isOpen,
  onClose,
  bookmarks,
  currentBlockId,
  currentSnippet,
  onAddBookmark,
  onDeleteBookmark,
  onUpdateNote,
  onJumpToBlock,
}: BookmarksDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [currentNote, setCurrentNote] = useState('');
  const [isAddingCurrent, setIsAddingCurrent] = useState(false);

  if (!isOpen) return null;

  const handleAddCurrent = async () => {
    const snippet = currentSnippet || `Paragraph #${currentBlockId + 1}`;
    await onAddBookmark(currentBlockId, snippet, currentNote.trim() || undefined);
    setIsAddingCurrent(false);
    setCurrentNote('');
  };

  const handleStartEditNote = (bm: Bookmark) => {
    setEditingId(bm.id);
    setNoteInput(bm.note || '');
  };

  const handleSaveNote = async (id: string) => {
    await onUpdateNote(id, noteInput.trim());
    setEditingId(null);
  };

  const isCurrentBookmarked = bookmarks.some((b) => b.blockId === currentBlockId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-sm sm:max-w-md h-full flex flex-col shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          borderLeft: '1px solid rgba(128, 128, 128, 0.2)',
        }}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <BookmarkIcon className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-base tracking-tight font-serif">
              Bookmarks ({bookmarks.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded"
            aria-label="Close bookmarks"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Bookmark at Current Position banner */}
        <div className="p-4 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-2">
          {!isAddingCurrent ? (
            <button
              onClick={() => setIsAddingCurrent(true)}
              disabled={isCurrentBookmarked}
              className="w-full py-2 px-3 text-xs font-semibold rounded-xl text-white transition flex items-center justify-center gap-2 shadow disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>
                {isCurrentBookmarked
                  ? 'Current block already bookmarked'
                  : `Bookmark Current Spot (#${currentBlockId + 1})`}
              </span>
            </button>
          ) : (
            <div className="space-y-2 animate-fade-in text-xs">
              <div className="font-semibold">Add note for current position:</div>
              <input
                type="text"
                value={currentNote}
                onChange={(e) => setCurrentNote(e.target.value)}
                placeholder="Optional note (e.g. Great quote / check this)"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsAddingCurrent(false)}
                  className="px-2.5 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCurrent}
                  className="px-3 py-1 rounded-lg text-white font-medium shadow"
                  style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
                >
                  Save Bookmark
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bookmarks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {bookmarks.length === 0 ? (
            <div className="py-16 text-center text-xs opacity-60">
              <BookmarkPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No bookmarks yet.
              <div className="mt-1">
                Tap on any paragraph or click the button above to add one.
              </div>
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="p-3.5 rounded-xl border border-black/10 dark:border-white/10 space-y-2 hover:border-blue-500/50 transition group"
                style={{ backgroundColor: 'var(--sb-bg)' }}
              >
                {/* Snippet / Jump target */}
                <div
                  onClick={() => {
                    onJumpToBlock(bm.blockId);
                    onClose();
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] opacity-60 mb-1">
                    <span className="font-mono font-bold text-blue-500">
                      Block #{bm.blockId + 1}
                    </span>
                    <span>
                      {new Date(bm.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-xs italic line-clamp-3 leading-relaxed opacity-85 group-hover:opacity-100 font-serif">
                    “{bm.snippet}”
                  </p>
                </div>

                {/* Note display or edit */}
                {editingId === bm.id ? (
                  <div className="space-y-1.5 pt-1 text-xs">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Add a note..."
                      className="w-full px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveNote(bm.id)}
                        className="px-2 py-0.5 rounded text-white text-[11px]"
                        style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-[11px]">
                    <div
                      onClick={() => handleStartEditNote(bm)}
                      className="cursor-pointer opacity-75 hover:opacity-100 truncate flex-1 mr-2"
                      title="Click to edit note"
                    >
                      {bm.note ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{bm.note}</span>
                        </span>
                      ) : (
                        <span className="opacity-50 italic">+ Add note</span>
                      )}
                    </div>
                    <button
                      onClick={() => onDeleteBookmark(bm.id)}
                      className="text-gray-400 hover:text-red-500 p-1 transition"
                      title="Delete bookmark"
                      aria-label="Delete bookmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
