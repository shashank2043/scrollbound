'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  Split,
  Plus,
  Trash2,
  Scissors,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  List,
  Check,
  RotateCcw,
  Sliders,
  ArrowRight,
} from 'lucide-react';
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
  const [viewTab, setViewTab] = useState<'visual' | 'outline'>('visual');
  const [rescanKeyword, setRescanKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<ChapterSuggestion[]>(initialSuggestions);

  // Content viewer navigation state
  const WINDOW_SIZE = 60;
  const [windowStart, setWindowStart] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(-1);
  const [targetedBlockId, setTargetedBlockId] = useState<number | null>(null);

  // Quick split confirmation popover state
  const [pendingSplitBlock, setPendingSplitBlock] = useState<number | null>(null);
  const [customSplitTitle, setCustomSplitTitle] = useState('');

  // Manual fallback block number entry
  const [manualBlockNumber, setManualBlockNumber] = useState<number>(0);
  const [showManualInput, setShowManualInput] = useState(false);

  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Map of block index -> chapter suggestion starting at that block
  const chapterStartsMap = useMemo(() => {
    const map = new Map<number, ChapterSuggestion>();
    for (const chap of suggestions) {
      map.set(chap.startBlockIndex, chap);
    }
    return map;
  }, [suggestions]);

  // Search logic across all blocks
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchMatches([]);
      setActiveMatchIndex(-1);
      return;
    }

    const matches: number[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].text.toLowerCase().includes(q)) {
        matches.push(i);
      }
    }
    setSearchMatches(matches);
    setActiveMatchIndex(matches.length > 0 ? 0 : -1);

    if (matches.length > 0) {
      jumpToBlock(matches[0]);
    }
  }, [searchQuery, blocks]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(nextIdx);
    jumpToBlock(searchMatches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx =
      (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(prevIdx);
    jumpToBlock(searchMatches[prevIdx]);
  };

  const jumpToBlock = (targetBlockIndex: number) => {
    const clamped = Math.max(0, Math.min(blocks.length - 1, targetBlockIndex));
    // Center the target in the visible window
    const newStart = Math.max(
      0,
      Math.min(blocks.length - WINDOW_SIZE, clamped - Math.floor(WINDOW_SIZE / 3))
    );
    setWindowStart(newStart);
    setTargetedBlockId(clamped);

    // Scroll to the element after render
    setTimeout(() => {
      const el = document.getElementById(`split-block-${clamped}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleJumpToChapter = (chapterId: string) => {
    const found = suggestions.find((s) => s.id === chapterId);
    if (found) {
      jumpToBlock(found.startBlockIndex);
      setViewTab('visual');
    }
  };

  const handleRescan = () => {
    const updated = detectChapters(blocks, { keyword: rescanKeyword.trim() });
    setSuggestions(updated);
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  const handleDeleteChapter = (id: string) => {
    if (suggestions.length <= 1) return;
    const filtered = suggestions.filter((s) => s.id !== id);
    setSuggestions(recalculateBoundaries(filtered, blocks.length));
  };

  // Open inline split prompt for a block
  const handleInitiateSplitAtBlock = (blockIndex: number) => {
    const block = blocks[blockIndex];
    if (!block) return;

    let defaultTitle = `Chapter ${suggestions.length + 1}`;
    const raw = block.text.trim();
    if (
      /^\s*(?:chapter|ch\.?|epilogue|prologue|act|volume|part|section)\b/i.test(raw)
    ) {
      defaultTitle = raw.length > 70 ? raw.slice(0, 67) + '...' : raw;
    } else if (raw.length <= 40) {
      defaultTitle = raw;
    }

    setPendingSplitBlock(blockIndex);
    setCustomSplitTitle(defaultTitle);
  };

  // Confirm adding breakpoint
  const handleConfirmSplitAtBlock = () => {
    if (pendingSplitBlock === null) return;
    const cut = pendingSplitBlock;

    // Disallow duplicate breakpoint at same block
    if (suggestions.some((s) => s.startBlockIndex === cut)) {
      setPendingSplitBlock(null);
      return;
    }

    const newSuggestion: ChapterSuggestion = {
      id: `chap_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: customSplitTitle.trim() || `Chapter ${suggestions.length + 1}`,
      startBlockIndex: cut,
      endBlockIndex: blocks.length,
      previewSnippet: blocks[cut]?.text.slice(0, 100) || '',
    };

    const combined = [...suggestions, newSuggestion];
    setSuggestions(recalculateBoundaries(combined, blocks.length));
    setPendingSplitBlock(null);
  };

  // Windowed blocks for fast 60fps rendering
  const visibleBlocks = useMemo(() => {
    const end = Math.min(blocks.length, windowStart + WINDOW_SIZE);
    return blocks.slice(windowStart, end);
  }, [blocks, windowStart, WINDOW_SIZE]);

  return (
    <div className="flex flex-col h-full space-y-3 font-sans">
      {/* Top Mode Selector (Single Book vs Split into Chapters) */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setSplitMode('single')}
          className={`py-2 px-3 rounded-lg transition text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            splitMode === 'single'
              ? 'bg-blue-600 text-white shadow-sm font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Single Continuous Novel ({blocks.length} blocks)</span>
        </button>
        <button
          type="button"
          onClick={() => setSplitMode('split')}
          className={`py-2 px-3 rounded-lg transition text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            splitMode === 'split'
              ? 'bg-blue-600 text-white shadow-sm font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Split into Chapters ({suggestions.length} detected)</span>
        </button>
      </div>

      {splitMode === 'single' ? (
        <div className="p-6 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] text-sm space-y-2 my-auto">
          <p className="font-bold text-base">Import as One Continuous Book</p>
          <p className="opacity-70 leading-relaxed text-xs">
            All {blocks.length.toLocaleString()} text blocks will be stored in a single
            novel. Virtualized reading, cloud synchronization, and bookmarks will operate
            continuously without chapter division.
          </p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 space-y-3">
          {/* Sub-Tabs: Visual Content Splitter vs Chapter Outline */}
          <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewTab('visual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewTab === 'visual'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Visual Content Splitter</span>
              </button>
              <button
                type="button"
                onClick={() => setViewTab('outline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewTab === 'outline'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Chapter Outline ({suggestions.length})</span>
              </button>
            </div>

            {/* Quick jump to chapter dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] opacity-60 hidden sm:inline">Jump to:</span>
              <select
                onChange={(e) => handleJumpToChapter(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border border-black/15 dark:border-white/15 bg-transparent focus:outline-none max-w-[150px] sm:max-w-[200px] truncate"
                defaultValue=""
              >
                <option value="" disabled>
                  Select Chapter...
                </option>
                {suggestions.map((chap, idx) => (
                  <option key={chap.id} value={chap.id}>
                    Ch. {idx + 1}: {chap.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TAB 1: VISUAL CONTENT SPLITTER */}
          {viewTab === 'visual' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-2">
              {/* Toolbar: In-Content Search & Range Navigator */}
              <div className="p-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2 shrink-0">
                {/* Search Bar */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search text in novel (e.g. Chapter 1412, Prologue)..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {searchMatches.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-mono shrink-0">
                      <span className="opacity-70">
                        {activeMatchIndex + 1}/{searchMatches.length}
                      </span>
                      <button
                        type="button"
                        onClick={handlePrevMatch}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
                        title="Previous Match"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextMatch}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
                        title="Next Match"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Block Range Navigator */}
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setWindowStart(Math.max(0, windowStart - WINDOW_SIZE))}
                    disabled={windowStart === 0}
                    className="p-1.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition"
                    title="Previous Page of Blocks"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono opacity-75">
                    Blocks {windowStart + 1}–
                    {Math.min(blocks.length, windowStart + WINDOW_SIZE)} of {blocks.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setWindowStart(
                        Math.min(blocks.length - WINDOW_SIZE, windowStart + WINDOW_SIZE)
                      )
                    }
                    disabled={windowStart + WINDOW_SIZE >= blocks.length}
                    className="p-1.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition"
                    title="Next Page of Blocks"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Instructions Banner */}
              <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Click <strong>&quot;Split Chapter Here&quot;</strong> on any paragraph below to place a breakpoint.
                  </span>
                </div>
                <span className="opacity-75 font-mono text-[10px]">
                  {suggestions.length} Breakpoints Active
                </span>
              </div>

              {/* Scrollable Content Reading Window */}
              <div
                ref={contentContainerRef}
                className="flex-1 min-h-[300px] max-h-[460px] overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3 divide-y divide-black/5 dark:divide-white/5 bg-black/[0.01] dark:bg-white/[0.01]"
              >
                {visibleBlocks.map((block, relativeIdx) => {
                  const absoluteBlockIndex = windowStart + relativeIdx;
                  const chapterStartingHere = chapterStartsMap.get(absoluteBlockIndex);
                  const isFirstBlock = absoluteBlockIndex === 0;
                  const isTargeted = targetedBlockId === absoluteBlockIndex;
                  const isMatchingSearch =
                    searchQuery.trim().length > 0 &&
                    block.text.toLowerCase().includes(searchQuery.trim().toLowerCase());

                  return (
                    <div
                      key={block.id ?? absoluteBlockIndex}
                      id={`split-block-${absoluteBlockIndex}`}
                      className={`pt-3 first:pt-0 transition-colors rounded-lg ${
                        isTargeted ? 'bg-blue-500/10 p-2' : ''
                      }`}
                    >
                      {/* Chapter Breakpoint Header Banner if a chapter starts here */}
                      {chapterStartingHere && (
                        <div className="mb-2 p-2.5 rounded-xl bg-blue-600 text-white shadow-sm flex items-center justify-between gap-2 text-xs animate-fade-in">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="px-1.5 py-0.5 rounded bg-white/20 font-mono font-bold text-[10px] shrink-0">
                              Ch.{' '}
                              {suggestions.findIndex(
                                (s) => s.id === chapterStartingHere.id
                              ) + 1}
                            </span>
                            <input
                              type="text"
                              value={chapterStartingHere.title}
                              onChange={(e) =>
                                handleTitleChange(chapterStartingHere.id, e.target.value)
                              }
                              className="bg-transparent border-b border-white/40 focus:border-white text-xs font-semibold px-1 py-0.5 flex-1 min-w-0 focus:outline-none"
                              placeholder="Chapter Title"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] opacity-75 font-mono hidden sm:inline">
                              Block #{absoluteBlockIndex}
                            </span>
                            {!isFirstBlock && suggestions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteChapter(chapterStartingHere.id)}
                                className="p-1 rounded hover:bg-white/20 text-white transition cursor-pointer"
                                title="Remove Breakpoint (merge with previous chapter)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Paragraph Text Content */}
                      <div className="group relative py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition flex items-start gap-2.5">
                        <span className="text-[10px] font-mono opacity-30 select-none pt-0.5 shrink-0 w-8 text-right">
                          #{absoluteBlockIndex}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-xs sm:text-sm leading-relaxed ${
                              block.type === 'heading'
                                ? 'font-bold text-base text-blue-600 dark:text-blue-400'
                                : 'opacity-85 font-serif'
                            }`}
                          >
                            {isMatchingSearch ? (
                              <mark className="bg-amber-300 dark:bg-amber-500 text-black px-0.5 rounded">
                                {block.text}
                              </mark>
                            ) : (
                              block.text
                            )}
                          </p>
                        </div>

                        {/* Interactive Split Action Button on the Block */}
                        {!chapterStartingHere && !isFirstBlock && (
                          <div className="shrink-0">
                            <button
                              type="button"
                              onClick={() => handleInitiateSplitAtBlock(absoluteBlockIndex)}
                              className="opacity-40 group-hover:opacity-100 hover:!opacity-100 focus:opacity-100 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-600 text-blue-600 hover:text-white dark:text-blue-400 dark:hover:text-white transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer shadow-xs"
                              title={`Split chapter at block #${absoluteBlockIndex}`}
                            >
                              <Scissors className="w-3 h-3" />
                              <span className="hidden sm:inline">Split Here</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Split Confirmation Prompt if user clicked Split Here on this block */}
                      {pendingSplitBlock === absoluteBlockIndex && (
                        <div className="my-2 p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 text-xs space-y-2 animate-fade-in">
                          <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                            <Scissors className="w-3.5 h-3.5" />
                            <span>Confirm Chapter Breakpoint at Block #{absoluteBlockIndex}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={customSplitTitle}
                              onChange={(e) => setCustomSplitTitle(e.target.value)}
                              placeholder="Enter chapter title..."
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-white dark:bg-black/40 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmSplitAtBlock();
                                if (e.key === 'Escape') setPendingSplitBlock(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={handleConfirmSplitAtBlock}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Create Chapter</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingSplitBlock(null)}
                              className="px-2.5 py-1.5 rounded-lg opacity-60 hover:opacity-100 text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CHAPTER OUTLINE & SUMMARY */}
          {viewTab === 'outline' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              {/* Pattern Auto-Detector Bar */}
              <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold opacity-75">
                    Pattern Auto-Scanner
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>{showManualInput ? 'Hide Manual Entry' : 'Manual Block #'}</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rescanKeyword}
                    onChange={(e) => setRescanKeyword(e.target.value)}
                    placeholder="e.g. Chapter 1408 or Chapter or Act"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleRescan}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Re-scan</span>
                  </button>
                </div>

                {/* Collapsible Manual Block Entry */}
                {showManualInput && (
                  <div className="pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-2 text-xs">
                    <span className="opacity-75">Block Number:</span>
                    <input
                      type="number"
                      min={0}
                      max={blocks.length - 1}
                      value={manualBlockNumber}
                      onChange={(e) => setManualBlockNumber(parseInt(e.target.value, 10) || 0)}
                      className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleInitiateSplitAtBlock(manualBlockNumber);
                        setViewTab('visual');
                        jumpToBlock(manualBlockNumber);
                      }}
                      className="px-3 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 cursor-pointer"
                    >
                      Locate &amp; Split
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable List of Chapters */}
              <div className="flex-1 min-h-[300px] max-h-[460px] overflow-y-auto space-y-2 pr-1 rounded-xl">
                {suggestions.map((chap, idx) => {
                  const blockCount = chap.endBlockIndex - chap.startBlockIndex;
                  return (
                    <div
                      key={chap.id}
                      className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] hover:border-blue-500/30 transition space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 shrink-0 font-bold">
                          Ch. {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={chap.title}
                          onChange={(e) => handleTitleChange(chap.id, e.target.value)}
                          placeholder="Chapter title"
                          className="flex-1 font-semibold text-xs px-2 py-1 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-700 focus:border-blue-500 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            jumpToBlock(chap.startBlockIndex);
                            setViewTab('visual');
                          }}
                          className="px-2 py-1 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition"
                          title="View and adjust breakpoint in content"
                        >
                          <Eye className="w-3 h-3 text-blue-500" />
                          <span className="hidden sm:inline">Locate</span>
                        </button>
                        {suggestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteChapter(chap.id)}
                            className="text-red-500 hover:text-red-600 p-1.5 rounded opacity-70 hover:opacity-100 text-xs shrink-0 cursor-pointer"
                            title="Delete and merge with adjacent chapter"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] opacity-70 px-1 font-mono">
                        <span>
                          Starts at block #{chap.startBlockIndex}
                        </span>
                        <span>{blockCount} blocks</span>
                      </div>

                      {chap.previewSnippet && (
                        <div className="text-[11px] opacity-60 line-clamp-1 italic px-1 font-serif">
                          &ldquo;{chap.previewSnippet}&rdquo;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-black/10 dark:border-white/10 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
        >
          Back
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
          className="px-5 py-2 text-xs font-semibold rounded-xl text-white shadow transition cursor-pointer"
          style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
        >
          {splitMode === 'single'
            ? 'Import Continuous Novel'
            : `Confirm Split (${suggestions.length} Chapters)`}
        </button>
      </div>
    </div>
  );
}
