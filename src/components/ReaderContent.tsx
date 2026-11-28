'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bookmark as BookmarkIcon, BookmarkPlus } from 'lucide-react';
import { Block, Book, Bookmark, Progress, ReaderSettings, Chunk } from '../lib/types';
import { getChunk, CHUNK_SIZE } from '../lib/db';

interface ReaderContentProps {
  book: Book;
  initialProgress: Progress | null;
  bookmarks: Bookmark[];
  settings: ReaderSettings;
  onPositionChange: (blockId: number, offset: number) => void;
  onToggleBookmark: (blockId: number, text: string) => void;
  jumpToBlockId?: number | null;
  onJumpHandled?: () => void;
}

export function ReaderContent({
  book,
  initialProgress,
  bookmarks,
  onPositionChange,
  onToggleBookmark,
  jumpToBlockId,
  onJumpHandled,
}: ReaderContentProps) {
  // Loaded chunks map: chunkIndex -> Block[]
  const [chunkMap, setChunkMap] = useState<Map<number, Block[]>>(new Map());
  const [minChunkIdx, setMinChunkIdx] = useState<number>(0);
  const [maxChunkIdx, setMaxChunkIdx] = useState<number>(0);
  const [isLoadingChunk, setIsLoadingChunk] = useState<boolean>(false);

  // Track if restoration is complete
  const targetBlockId = initialProgress?.blockId ?? 0;
  const targetOffset = initialProgress?.offset ?? 0;
  const needsRestore = targetBlockId > 0 || targetOffset > 0;

  const [hasRestoredPosition, setHasRestoredPosition] = useState<boolean>(!needsRestore);
  const [activeParagraphId, setActiveParagraphId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isRestoringRef = useRef<boolean>(false);

  // Disable automatic browser scroll restoration to prevent scroll position clobbering
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Set of bookmarked block IDs for fast lookup
  const bookmarkedBlockIds = new Set(bookmarks.map((b) => b.blockId));

  // 1. Initial chunk loading based on targetBlockId
  useEffect(() => {
    let isMounted = true;
    const initialChunk = Math.min(
      book.chunkCount - 1,
      Math.max(0, Math.floor(targetBlockId / CHUNK_SIZE))
    );

    async function loadInitial() {
      setIsLoadingChunk(true);
      const newMap = new Map<number, Block[]>();

      // Load surrounding chunks:
      // If near beginning, start at 0. Otherwise load 2 chunks before up to 1 chunk after
      const maxToLoad = Math.min(book.chunkCount - 1, initialChunk + 1);
      const fromChunk = initialChunk <= 10 ? 0 : Math.max(0, initialChunk - 2);

      const promises: Promise<Chunk | undefined>[] = [];
      for (let c = fromChunk; c <= maxToLoad; c++) {
        promises.push(getChunk(book.id, c));
      }

      const results = await Promise.all(promises);
      if (!isMounted) return;

      let min = fromChunk;
      let max = fromChunk;

      for (const chunk of results) {
        if (chunk) {
          newMap.set(chunk.index, chunk.blocks);
          if (chunk.index < min) min = chunk.index;
          if (chunk.index > max) max = chunk.index;
        }
      }

      setChunkMap(newMap);
      setMinChunkIdx(min);
      setMaxChunkIdx(max);
      setIsLoadingChunk(false);
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, [book.id, book.chunkCount, targetBlockId]);

  // 2. Restore reading position once target block is in DOM
  useEffect(() => {
    if (hasRestoredPosition || chunkMap.size === 0 || isRestoringRef.current) return;

    if (!needsRestore) {
      setHasRestoredPosition(true);
      return;
    }

    const targetChunk = Math.min(
      book.chunkCount - 1,
      Math.max(0, Math.floor(targetBlockId / CHUNK_SIZE))
    );

    // Wait until the target chunk is actually in chunkMap before attempting DOM queries
    if (!chunkMap.has(targetChunk)) {
      return;
    }

    isRestoringRef.current = true;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById(`block-${targetBlockId}`);
      if (el) {
        clearInterval(interval);
        const scrollToBlock = () => {
          const rect = el.getBoundingClientRect();
          const headerOffset = 80;
          const targetScrollY = window.scrollY + rect.top + targetOffset * rect.height - headerOffset;
          window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior: 'instant',
          });
        };

        // Multi-pass restoration across render frames to ensure fonts and layout settle
        scrollToBlock();
        requestAnimationFrame(() => {
          scrollToBlock();
          setTimeout(() => {
            scrollToBlock();
            setHasRestoredPosition(true);
            isRestoringRef.current = false;
          }, 80);
        });
      } else if (attempts > 75) {
        // Fallback after 3 seconds
        clearInterval(interval);
        setHasRestoredPosition(true);
        isRestoringRef.current = false;
      }
    }, 40);

    return () => {
      clearInterval(interval);
    };
  }, [hasRestoredPosition, chunkMap, targetBlockId, targetOffset, needsRestore, book.chunkCount]);

  // 3. Handle jump-to bookmark or search target
  useEffect(() => {
    if (jumpToBlockId === null || jumpToBlockId === undefined) return;

    const targetChunk = Math.min(
      book.chunkCount - 1,
      Math.max(0, Math.floor(jumpToBlockId / CHUNK_SIZE))
    );

    async function ensureChunkAndJump() {
      if (!chunkMap.has(targetChunk)) {
        const chunk = await getChunk(book.id, targetChunk);
        if (chunk) {
          setChunkMap((prev) => new Map(prev).set(chunk.index, chunk.blocks));
          if (targetChunk < minChunkIdx) setMinChunkIdx(targetChunk);
          if (targetChunk > maxChunkIdx) setMaxChunkIdx(targetChunk);
        }
      }

      setTimeout(() => {
        const el = document.getElementById(`block-${jumpToBlockId}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - 80;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        }
        onJumpHandled?.();
      }, 100);
    }

    ensureChunkAndJump();
  }, [jumpToBlockId, book.id, book.chunkCount, chunkMap, minChunkIdx, maxChunkIdx, onJumpHandled]);

  // 4. Load Next Chunk (infinite scroll down)
  const loadNextChunk = useCallback(async () => {
    if (isLoadingChunk || maxChunkIdx >= book.chunkCount - 1) return;
    setIsLoadingChunk(true);
    const nextIdx = maxChunkIdx + 1;
    const chunk = await getChunk(book.id, nextIdx);
    if (chunk) {
      setChunkMap((prev) => new Map(prev).set(chunk.index, chunk.blocks));
      setMaxChunkIdx(nextIdx);
    }
    setIsLoadingChunk(false);
  }, [book.id, book.chunkCount, maxChunkIdx, isLoadingChunk]);

  // 5. Load Previous Chunk (scroll up)
  const loadPrevChunk = useCallback(async () => {
    if (isLoadingChunk || minChunkIdx <= 0) return;
    setIsLoadingChunk(true);
    const prevIdx = minChunkIdx - 1;
    const chunk = await getChunk(book.id, prevIdx);
    if (chunk) {
      const prevScrollHeight = document.documentElement.scrollHeight;
      const prevScrollTop = window.scrollY;

      setChunkMap((prev) => new Map(prev).set(chunk.index, chunk.blocks));
      setMinChunkIdx(prevIdx);

      requestAnimationFrame(() => {
        const newScrollHeight = document.documentElement.scrollHeight;
        const delta = newScrollHeight - prevScrollHeight;
        window.scrollTo({ top: prevScrollTop + delta, behavior: 'instant' });
      });
    }
    setIsLoadingChunk(false);
  }, [book.id, minChunkIdx, isLoadingChunk]);

  // 6. Setup IntersectionObservers for top/bottom sentinels
  useEffect(() => {
    const bottomSentinel = bottomSentinelRef.current;
    if (!bottomSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingChunk) {
          loadNextChunk();
        }
      },
      { rootMargin: '600px' }
    );

    observer.observe(bottomSentinel);
    return () => observer.disconnect();
  }, [loadNextChunk, isLoadingChunk]);

  useEffect(() => {
    const topSentinel = topSentinelRef.current;
    if (!topSentinel || minChunkIdx <= 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingChunk) {
          loadPrevChunk();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(topSentinel);
    return () => observer.disconnect();
  }, [loadPrevChunk, isLoadingChunk, minChunkIdx]);

  // 7. Track position on scroll (only active after position restoration completes)
  useEffect(() => {
    if (!hasRestoredPosition) return;

    let ticking = false;

    const checkPosition = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const sampleY = 90; // Top reading line under header
          const sampleX = window.innerWidth / 2;

          let foundBlock: HTMLElement | null = null;
          const el = document.elementFromPoint(sampleX, sampleY);
          if (el) {
            foundBlock = el.closest('[data-block-id]') as HTMLElement | null;
          }

          if (!foundBlock) {
            const allVisibleBlocks = document.querySelectorAll<HTMLElement>('[data-block-id]');
            for (let i = 0; i < allVisibleBlocks.length; i++) {
              const b = allVisibleBlocks[i];
              const r = b.getBoundingClientRect();
              if (r.top <= sampleY + 20 && r.bottom >= sampleY - 20) {
                foundBlock = b;
                break;
              }
            }
          }

          if (foundBlock && foundBlock.dataset.blockId) {
            const blockId = parseInt(foundBlock.dataset.blockId, 10);
            const rect = foundBlock.getBoundingClientRect();
            const offset = Math.max(0, Math.min(1, (sampleY - rect.top) / (rect.height || 1)));
            onPositionChange(blockId, offset);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('scroll', checkPosition, { passive: true });
    }, 150);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', checkPosition);
    };
  }, [hasRestoredPosition, onPositionChange]);

  // Render all currently loaded blocks in sequential order
  const sortedChunkIndices = Array.from(chunkMap.keys()).sort((a, b) => a - b);
  const allBlocks: Block[] = [];
  for (const idx of sortedChunkIndices) {
    const blocks = chunkMap.get(idx);
    if (blocks) {
      allBlocks.push(...blocks);
    }
  }

  return (
    <div
      ref={containerRef}
      className="pt-20 pb-40 px-3 sm:px-8 transition-all max-w-full overflow-x-hidden"
      style={{
        fontSize: 'var(--sb-font-size, 18px)',
        fontFamily: 'var(--sb-font-family, serif)',
        lineHeight: 'var(--sb-line-height, 1.7)',
        color: 'var(--sb-text)',
      }}
      onClick={(e) => {
        // If clicking outside any block, clear active tap
        const target = e.target as HTMLElement;
        if (!target.closest('[data-block-id]')) {
          setActiveParagraphId(null);
        }
      }}
    >
      {/* Top Sentinel for loading previous chunks when scrolling up */}
      <div ref={topSentinelRef} className="h-4" />

      {/* Main reader container with constrained width */}
      <div
        className="mx-auto select-text max-w-full break-words"
        style={{
          maxWidth: 'var(--sb-content-width, 65ch)',
        }}
      >
        {allBlocks.map((block) => {
          const isBookmarked = bookmarkedBlockIds.has(block.id);
          const isActive = activeParagraphId === block.id;

          if (block.type === 'heading') {
            return (
              <div
                key={block.id}
                id={`block-${block.id}`}
                data-block-id={block.id}
                onClick={() => setActiveParagraphId(isActive ? null : block.id)}
                className={`relative group pt-8 pb-4 scroll-mt-24 cursor-pointer sm:cursor-default rounded-xl transition-all ${
                  isActive ? 'bg-black/[0.03] dark:bg-white/[0.04] px-2' : ''
                }`}
              >
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight opacity-95 text-center font-serif break-words">
                  {block.text}
                </h2>

                {/* Bookmark trigger on heading (visible on desktop hover or mobile active or bookmarked) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBookmark(block.id, block.text);
                  }}
                  className={`absolute right-1 top-8 p-2 rounded-lg text-sm transition ${
                    isBookmarked
                      ? 'opacity-100 text-amber-500 scale-110'
                      : isActive
                      ? 'opacity-100 bg-black/10 dark:bg-white/15'
                      : 'opacity-0 group-hover:opacity-100 opacity-40 hover:opacity-100'
                  }`}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
                  aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
                >
                  {isBookmarked ? (
                    <BookmarkIcon className="w-4 h-4 fill-current text-amber-500" />
                  ) : (
                    <BookmarkPlus className="w-4 h-4" />
                  )}
                </button>
              </div>
            );
          }

          // Paragraph
          return (
            <div
              key={block.id}
              id={`block-${block.id}`}
              data-block-id={block.id}
              onClick={() => setActiveParagraphId(isActive ? null : block.id)}
              className={`relative group my-4 scroll-mt-24 rounded-lg transition-all p-2 -mx-2 ${
                isBookmarked
                  ? 'border-l-4 pl-3.5 border-amber-500/80 bg-amber-500/5'
                  : isActive
                  ? 'bg-blue-500/5 ring-1 ring-blue-500/20'
                  : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
              }`}
            >
              <p className="text-justify sm:text-left leading-relaxed break-words">
                {block.text}
              </p>

              {/* Bookmark indicator / trigger button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark(block.id, block.text);
                }}
                className={`absolute right-1 top-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-md text-xs transition z-10 ${
                  isBookmarked
                    ? 'opacity-100 text-amber-500 scale-110'
                    : isActive
                    ? 'opacity-100 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium px-2 py-1'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark paragraph'}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark paragraph'}
              >
                {isBookmarked ? (
                  <BookmarkIcon className="w-4 h-4 fill-current text-amber-500" />
                ) : isActive ? (
                  <span className="flex items-center gap-1 text-[11px]">
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Bookmark</span>
                  </span>
                ) : (
                  <BookmarkPlus className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom Sentinel for loading subsequent chunks */}
      <div ref={bottomSentinelRef} className="h-20 flex items-center justify-center">
        {isLoadingChunk && (
          <div className="text-xs opacity-50 flex items-center gap-2 font-mono">
            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading next chunk...</span>
          </div>
        )}
        {maxChunkIdx >= book.chunkCount - 1 && allBlocks.length > 0 && (
          book.nextBookId ? (
            <div className="py-10 text-center space-y-3 border-t border-black/10 dark:border-white/10 mt-8 max-w-sm mx-auto">
              <div className="text-xs opacity-50 font-mono">
                — End of {book.chapterTitle || `Chapter ${(book.chapterIndex ?? 0) + 1}`} —
              </div>
              <Link
                href={`/read/${book.nextBookId}`}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow transition hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                <span>Read Next Chapter</span>
                <span>→</span>
              </Link>
            </div>
          ) : (
            <div className="text-xs opacity-40 font-mono py-8 text-center border-t border-black/10 dark:border-white/10 mt-8 max-w-xs mx-auto">
              — End of Novel —
            </div>
          )
        )}
      </div>
    </div>
  );
}
