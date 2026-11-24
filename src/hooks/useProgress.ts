'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Progress } from '../lib/types';
import { getProgress, saveProgress } from '../lib/db';

export function useProgress(bookId: string, totalBlocks: number) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [currentBlockId, setCurrentBlockId] = useState<number>(0);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [percent, setPercent] = useState<number>(0);
  const [isRestored, setIsRestored] = useState(false);

  const pendingProgressRef = useRef<Progress | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing progress from IndexedDB
  useEffect(() => {
    let isMounted = true;
    getProgress(bookId).then((saved) => {
      if (!isMounted) return;
      if (saved) {
        setProgress(saved);
        setCurrentBlockId(saved.blockId);
        setCurrentOffset(saved.offset);
        setPercent(saved.percent);
      }
      setIsRestored(true);
    });

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  // Flush pending progress immediately
  const flushProgress = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingProgressRef.current) {
      saveProgress(pendingProgressRef.current);
      pendingProgressRef.current = null;
    }
  }, []);

  // Update position with debouncing
  const updatePosition = useCallback(
    (blockId: number, offset: number) => {
      const clampedOffset = Math.max(0, Math.min(1, offset));
      const calcPercent = totalBlocks > 0
        ? Math.min(100, Math.max(0, ((blockId + clampedOffset) / totalBlocks) * 100))
        : 0;

      setCurrentBlockId(blockId);
      setCurrentOffset(clampedOffset);
      setPercent(calcPercent);

      const prog: Progress = {
        bookId,
        blockId,
        offset: clampedOffset,
        percent: calcPercent,
        updatedAt: Date.now(),
      };

      pendingProgressRef.current = prog;

      // Immediate synchronous local cache
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`scrollbound_progress_${bookId}`, JSON.stringify(prog));
        } catch {}
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        flushProgress();
      }, 500);
    },
    [bookId, totalBlocks, flushProgress]
  );

  // Listen to visibilitychange and beforeunload to save immediately
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushProgress();
      }
    };

    const handleBeforeUnload = () => {
      flushProgress();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushProgress();
    };
  }, [flushProgress]);

  return {
    progress,
    currentBlockId,
    currentOffset,
    percent,
    isRestored,
    updatePosition,
    flushProgress,
  };
}
