'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [hasRestoredPosition, setHasRestoredPosition] = useState<boolean>(() => {
    return !initialProgress || (initialProgress.blockId === 0 && initialProgress.offset === 0);
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isRestoringRef = useRef<boolean>(false);

  // Set of bookmarked block IDs for fast lookup
  const bookmarkedBlockIds = new Set(bookmarks.map((b) => b.blockId));

  // 1. Initial chunk loading based on initialProgress
  useEffect(() => {
    let isMounted = true;
    const initialBlockId = initialProgress ? initialProgress.blockId : 0;
    const initialChunk = Math.min(
      book.chunkCount - 1,
      Math.max(0, Math.floor(initialBlockId / CHUNK_SIZE))
    );

    async function loadInitial() {
      setIsLoadingChunk(true);
      const newMap = new Map<number, Block[]>();

      // Load all chunks from 0 up to initialChunk + 1 so layout above reader is solid and stable
      const maxToLoad = Math.min(book.chunkCount - 1, initialChunk + 1);
      const fromChunk = initialChunk <= 15 ? 0 : Math.max(0, initialChunk - 2);

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
  }, [book.id, book.chunkCount, initialProgress]);

  // 2. Restore reading position once initial target block is in DOM
  useEffect(() => {
    if (hasRestoredPosition || chunkMap.size === 0 || isRestoringRef.current) return;

    const targetBlockId = initialProgress ? initialProgress.blockId : 0;
    const offset = initialProgress ? initialProgress.offset : 0;

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
          const targetScrollY = window.scrollY + rect.top + offset * rect.height - headerOffset;
          window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior: 'instant',
          });
        };

        // Multi-pass restoration to lock position across font metrics and layout passes
        scrollToBlock();
        requestAnimationFrame(() => {
          scrollToBlock();
          setTimeout(() => {
            scrollToBlock();
            setHasRestoredPosition(true);
            isRestoringRef.current = false;
          }, 60);
        });
      } else if (attempts > 50) {
        clearInterval(interval);
        setHasRestoredPosition(true);
        isRestoringRef.current = false;
      }
    }, 40);

    return () => {
      clearInterval(interval);
    };
  }, [hasRestoredPosition, chunkMap, initialProgress]);

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

      // Smooth scroll to the target block
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
      // Remember scroll height before prepending to prevent jump
      const prevScrollHeight = document.documentElement.scrollHeight;
      const prevScrollTop = window.scrollY;

      setChunkMap((prev) => new Map(prev).set(chunk.index, chunk.blocks));
      setMinChunkIdx(prevIdx);

      // Adjust scroll after render
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

  // 7. Track position on scroll
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
      className="pt-20 pb-40 px-4 sm:px-8 transition-all"
      style={{
        fontSize: 'var(--sb-font-size, 18px)',
        fontFamily: 'var(--sb-font-family, serif)',
        lineHeight: 'var(--sb-line-height, 1.7)',
        color: 'var(--sb-text)',
      }}
    >
      {/* Top Sentinel for loading previous chunks when scrolling up */}
      <div ref={topSentinelRef} className="h-4" />

      {/* Main reader container with constrained width */}
      <div
        className="mx-auto select-text"
        style={{
          maxWidth: 'var(--sb-content-width, 65ch)',
        }}
      >
        {allBlocks.map((block) => {
          const isBookmarked = bookmarkedBlockIds.has(block.id);

          if (block.type === 'heading') {
            return (
              <div
                key={block.id}
                id={`block-${block.id}`}
                data-block-id={block.id}
                className="relative group pt-8 pb-4 scroll-mt-24"
              >
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight opacity-95 text-center font-serif">
                  {block.text}
                </h2>
                {/* Bookmark trigger on heading */}
                <button
                  onClick={() => onToggleBookmark(block.id, block.text)}
                  className={`absolute right-0 top-8 p-1.5 rounded-lg text-sm transition opacity-0 group-hover:opacity-100 ${
                    isBookmarked ? '!opacity-100 text-amber-500' : 'opacity-40 hover:opacity-100'
                  }`}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
                >
                  {isBookmarked ? '🔖' : '📑'}
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
              className={`relative group my-4 scroll-mt-24 rounded-lg transition-colors p-1.5 -mx-1.5 ${
                isBookmarked
                  ? 'border-l-4 pl-3.5 border-amber-500/80 bg-amber-500/5'
                  : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
              }`}
            >
              <p className="text-justify sm:text-left leading-relaxed">
                {block.text}
              </p>

              {/* Bookmark indicator / trigger button */}
              <button
                onClick={() => onToggleBookmark(block.id, block.text)}
                className={`absolute right-1 top-1 p-1 rounded-md text-xs transition ${
                  isBookmarked
                    ? 'opacity-100 text-amber-500 scale-110'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark paragraph'}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark paragraph'}
              >
                {isBookmarked ? '🔖' : '📑'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom Sentinel for loading subsequent chunks */}
      <div ref={bottomSentinelRef} className="h-20 flex items-center justify-center">
        {isLoadingChunk && (
          <div className="text-xs opacity-50 flex items-center gap-2 font-mono">
            <span className="inline-block animate-spin">⏳</span>
            <span>Loading next chunk...</span>
          </div>
        )}
        {maxChunkIdx >= book.chunkCount - 1 && allBlocks.length > 0 && (
          <div className="text-xs opacity-40 font-mono py-8 text-center border-t border-black/10 dark:border-white/10 mt-8 max-w-xs mx-auto">
            — End of Novel —
          </div>
        )}
      </div>
    </div>
  );
}
