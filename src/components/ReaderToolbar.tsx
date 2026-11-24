'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ReaderToolbarProps {
  title: string;
  percent: number;
  bookmarkCount: number;
  onOpenBookmarks: () => void;
  onOpenSettings: () => void;
  onLeave?: () => void;
}

export function ReaderToolbar({
  title,
  percent,
  bookmarkCount,
  onOpenBookmarks,
  onOpenSettings,
  onLeave,
}: ReaderToolbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Always show near the top
          if (currentScrollY < 60) {
            setIsVisible(true);
          } else if (currentScrollY > lastScrollY + 8) {
            // Scrolling down -> hide
            setIsVisible(false);
          } else if (lastScrollY - currentScrollY > 6) {
            // Scrolling up -> show
            setIsVisible(true);
          }

          setLastScrollY(currentScrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <>
      {/* 1. Thin overall progress bar pinned at the absolute top of the screen - always visible even when top bar hides */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-black/10 dark:bg-white/10 overflow-hidden pointer-events-none">
        <div
          className="h-full transition-all duration-150 ease-out"
          style={{
            width: `${percent}%`,
            backgroundColor: 'var(--sb-accent, #2563eb)',
          }}
        />
      </div>

      {/* 2. Floating percentage pill shown at the top when top bar is hidden */}
      <div
        className={`fixed top-2.5 right-4 z-40 transition-all duration-300 ease-in-out ${
          !isVisible
            ? 'opacity-85 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <button
          onClick={() => setIsVisible(true)}
          className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium backdrop-blur-md border shadow-sm transition hover:opacity-100 flex items-center gap-1.5 cursor-pointer"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--sb-bg) 85%, transparent)',
            borderColor: 'rgba(128, 128, 128, 0.2)',
            color: 'var(--sb-text)',
          }}
          title="Click to reveal header bar"
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          />
          <span>{Math.round(percent)}%</span>
        </button>
      </div>

      {/* 3. Collapsible Floating Toolbar */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${
          isVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <header
          className="backdrop-blur-md border-b px-4 sm:px-6 py-3 transition-colors shadow-sm pt-3.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--sb-bg) 88%, transparent)',
            borderColor: 'rgba(128, 128, 128, 0.15)',
            color: 'var(--sb-text)',
          }}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            {/* Back to Library */}
            <Link
              href="/"
              onClick={() => onLeave?.()}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0"
              title="Return to Library"
            >
              <span>←</span>
              <span className="hidden sm:inline">Library</span>
            </Link>

            {/* Book Title & Progress */}
            <div className="flex-1 min-w-0 text-center px-2">
              <h2 className="text-xs sm:text-sm font-semibold truncate font-serif">
                {title}
              </h2>
              <div className="text-[10px] opacity-60 font-mono">
                {Math.round(percent)}% read
              </div>
            </div>

            {/* Right actions: Bookmarks & Settings */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onOpenBookmarks}
                className="relative p-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-1"
                title="Bookmarks"
                aria-label="Bookmarks"
              >
                <span>🔖</span>
                {bookmarkCount > 0 && (
                  <span
                    className="px-1.5 py-0.2 text-[10px] font-bold rounded-full text-white"
                    style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
                  >
                    {bookmarkCount}
                  </span>
                )}
              </button>

              <button
                onClick={onOpenSettings}
                className="p-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/10 transition"
                title="Appearance Settings"
                aria-label="Appearance Settings"
              >
                <span>⚙️</span>
              </button>
            </div>
          </div>
        </header>
      </div>
    </>
  );
}
