'use client';

import React, { useState } from 'react';
import { Block } from '../lib/types';
import {
  ChapterSuggestion,
  detectChapters,
  recalculateBoundaries,
} from '../lib/chapterDetector';

interface ChapterSplitReviewProps {
  blocks: Block[];
  initialSuggestions: ChapterSuggestion[];
  onConfirmSingle: () => void;
  onConfirmSplit: (suggestions: ChapterSuggestion[]) => void;
  onBack: () => void;
}

export function ChapterSplitReview({
  blocks,
  initialSuggestions,
  onConfirmSingle,
  onConfirmSplit,
  onBack,
}: ChapterSplitReviewProps) {
  const [splitMode, setSplitMode] = useState<'single' | 'split'>('split');
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] =
    useState<ChapterSuggestion[]>(initialSuggestions);
  const [newCutBlockIndex, setNewCutBlockIndex] = useState<number>(0);
  const [isAddingCut, setIsAddingCut] = useState(false);

  const handleRescan = () => {
    const updated = detectChapters(blocks, { keyword: keyword.trim() });
    setSuggestions(updated);
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  const handleStartBlockChange = (id: string, newStart: number) => {
    const clamped = Math.max(0, Math.min(blocks.length - 1, newStart));
    const updated = suggestions.map((s) =>
      s.id === id ? { ...s, startBlockIndex: clamped } : s
    );
    setSuggestions(recalculateBoundaries(updated, blocks.length));
  };

  const handleDeleteChapter = (id: string) => {
    if (suggestions.length <= 1) return;
    const filtered = suggestions.filter((s) => s.id !== id);
    setSuggestions(recalculateBoundaries(filtered, blocks.length));
  };

  const handleAddBreakpoint = () => {
    const cut = Math.max(0, Math.min(blocks.length - 1, newCutBlockIndex));
    // Don't add duplicate start index
    if (suggestions.some((s) => s.startBlockIndex === cut)) {
      setIsAddingCut(false);
      return;
    }

    const newSuggestion: ChapterSuggestion = {
      id: `chap_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `Chapter ${suggestions.length + 1}`,
      startBlockIndex: cut,
      endBlockIndex: blocks.length,
      previewSnippet: blocks[cut]?.text.slice(0, 100) || '',
    };

    const combined = [...suggestions, newSuggestion];
    setSuggestions(recalculateBoundaries(combined, blocks.length));
    setIsAddingCut(false);
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-medium">
        <button
          type="button"
          onClick={() => setSplitMode('single')}
          className={`py-2 px-3 rounded-lg transition text-center ${
            splitMode === 'single'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          📖 Single Book ({blocks.length} blocks)
        </button>
        <button
          type="button"
          onClick={() => setSplitMode('split')}
          className={`py-2 px-3 rounded-lg transition text-center ${
            splitMode === 'split'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          📑 Split into Chapters ({suggestions.length})
        </button>
      </div>

      {splitMode === 'single' ? (
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] text-sm space-y-2">
          <p className="font-semibold text-base">Import as One Continuous Book</p>
          <p className="opacity-70 leading-relaxed text-xs">
            All {blocks.length.toLocaleString()} text blocks will be stored in a single
            novel. Progress tracking, bookmarking, and virtualized reading will operate
            continuously without chapter splits.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Keyword / Pattern Auto-Detector Bar */}
          <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2">
            <label className="block text-xs font-semibold opacity-75">
              Chapter Keyword / Split Pattern (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Chapter 1408 or Chapter or Act"
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleRescan}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm shrink-0"
              >
                Re-scan
              </button>
            </div>
            <p className="text-[11px] opacity-60">
              Suggestions are non-binding. You can adjust breakpoints, edit names, or add/delete chapters below.
            </p>
          </div>

          {/* Breakpoints List Header */}
          <div className="flex items-center justify-between text-xs font-medium px-1">
            <span className="opacity-75">
              Detected Breakpoints ({suggestions.length} chapters)
            </span>
            <button
              type="button"
              onClick={() => setIsAddingCut(!isAddingCut)}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>➕</span>
              <span>Add Breakpoint</span>
            </button>
          </div>

          {/* Add Breakpoint Form */}
          {isAddingCut && (
            <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2 animate-fade-in text-xs">
              <div className="font-semibold text-blue-600 dark:text-blue-400">
                Split Chapter at Block:
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={blocks.length - 1}
                  value={newCutBlockIndex}
                  onChange={(e) => setNewCutBlockIndex(parseInt(e.target.value, 10) || 0)}
                  className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                />
                <span className="opacity-60 text-[11px]">
                  (Max {blocks.length - 1})
                </span>
                <button
                  type="button"
                  onClick={handleAddBreakpoint}
                  className="px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 ml-auto"
                >
                  Insert Split
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingCut(false)}
                  className="px-2 py-1 opacity-60 hover:opacity-100"
                >
                  Cancel
                </button>
              </div>
              {blocks[newCutBlockIndex] && (
                <div className="text-[11px] opacity-75 italic line-clamp-1 bg-black/5 dark:bg-white/5 p-1 rounded">
                  Preview: &ldquo;{blocks[newCutBlockIndex].text.slice(0, 80)}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Scrollable list of chapters */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 rounded-xl">
            {suggestions.map((chap, idx) => {
              const blockCount = chap.endBlockIndex - chap.startBlockIndex;
              return (
                <div
                  key={chap.id}
                  className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] hover:border-blue-500/30 transition space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 shrink-0 font-semibold">
                      Ch. {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={chap.title}
                      onChange={(e) => handleTitleChange(chap.id, e.target.value)}
                      placeholder="Chapter title"
                      className="flex-1 font-semibold text-xs px-2 py-1 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-700 focus:border-blue-500 bg-transparent focus:outline-none"
                    />
                    {suggestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteChapter(chap.id)}
                        className="text-red-500 hover:text-red-600 p-1 rounded opacity-70 hover:opacity-100 text-xs shrink-0"
                        title="Delete and merge with adjacent chapter"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] opacity-70 px-1">
                    <div className="flex items-center gap-1.5">
                      <span>Start block:</span>
                      {idx === 0 ? (
                        <span className="font-mono font-medium">0</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={blocks.length - 1}
                          value={chap.startBlockIndex}
                          onChange={(e) =>
                            handleStartBlockChange(
                              chap.id,
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-16 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 bg-transparent text-[11px] font-mono"
                        />
                      )}
                    </div>
                    <span className="font-mono">{blockCount} blocks</span>
                  </div>

                  {chap.previewSnippet && (
                    <div className="text-[11px] opacity-60 line-clamp-1 italic px-1">
                      &ldquo;{chap.previewSnippet}&rdquo;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
        >
          ← Back to File
        </button>
        <button
          type="button"
          onClick={() => {
            if (splitMode === 'single') {
              onConfirmSingle();
            } else {
              onConfirmSplit(suggestions);
            }
          }}
          className="px-5 py-2 text-xs font-semibold rounded-xl text-white shadow transition"
          style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
        >
          {splitMode === 'single'
            ? 'Import Continuous Novel'
            : `Import as ${suggestions.length} Linked Chapters`}
        </button>
      </div>
    </div>
  );
}
