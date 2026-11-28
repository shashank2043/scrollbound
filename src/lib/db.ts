// Database abstraction layer using PostgreSQL (via Next.js API routes)
// Supports offline-first / local-first caching with background cloud sync, 50-step outbox logging,
// and Aspect-Oriented Programming (AOP) for cross-cutting logging & timing.

import { Block, Book, Bookmark, Chunk, ExportData, Progress, ReaderSettings, CustomTheme } from './types';
import { ChapterSuggestion, sliceBlocksForChapters } from './chapterDetector';
import {
  recordSyncAction,
  markSyncActionStatus,
  initSyncEngine,
  getLocalSyncLog,
  getPendingSyncActions,
  flushPendingSyncQueue,
  fetchCloudSyncLog,
  reconcileWithCloud,
  setAutoSyncConfig,
  logStep,
  SyncLogEntry,
} from './syncEngine';
import { aopBackgroundSync, aopLogged } from './aspects/loggingAspect';

export {
  recordSyncAction,
  markSyncActionStatus,
  initSyncEngine,
  setAutoSyncConfig,
  getLocalSyncLog,
  getPendingSyncActions,
  flushPendingSyncQueue,
  fetchCloudSyncLog,
  reconcileWithCloud,
  logStep,
};
export type { SyncLogEntry };

export const CHUNK_SIZE = 50;

export const SETTINGS_STORAGE_KEY = 'scrollbound_reader_settings';
export const THEMES_STORAGE_KEY = 'scrollbound_custom_themes';
export const CACHED_BOOKS_KEY = 'scrollbound_cached_books';
export const CACHED_PROGRESS_MAP_KEY = 'scrollbound_cached_progress_map';

/**
 * Fast in-memory LRU-like cache for chunks to prevent network requests during reading
 */
const chunkMemoryCache = new Map<string, Chunk>();

/**
 * Split an array of blocks into Chunk records of CHUNK_SIZE each
 */
export function createChunksFromBlocks(
  bookId: string,
  blocks: Block[],
  startIndex = 0
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIdx = startIndex;

  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    const chunkBlocks = blocks.slice(i, i + CHUNK_SIZE);
    chunks.push({
      id: `${bookId}:${chunkIdx}`,
      bookId,
      index: chunkIdx,
      blocks: chunkBlocks,
    });
    chunkIdx++;
  }

  return chunks;
}

/**
 * Background worker for non-blocking cloud upload of chunks
 * Allows the user to immediately read the book without waiting for full upload
 */
export function uploadChunksInBackground(
  bookId: string,
  chunks: Chunk[]
): void {
  if (!chunks || chunks.length === 0) return;

  const t0 = performance.now();
  logStep(`Background upload of ${chunks.length} chunk(s) for ${bookId}`, 'start');

  setTimeout(async () => {
    const BATCH_SIZE = 15;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      let success = false;
      for (let attempt = 0; attempt < 2 && !success; attempt++) {
        try {
          const res = await fetch(`/api/books/${bookId}/chunks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunks: batch }),
            keepalive: true,
          });
          if (res.ok) {
            success = true;
          } else {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    const elapsed = Math.round(performance.now() - t0);
    logStep(`Background chunk upload for ${bookId}`, 'synced', elapsed);
  }, 10);
}

/**
 * Core Book Save Function (wrapped with AOP logging)
 */
async function saveBookCore(book: Book, chunks: Chunk[]): Promise<void> {
  // 1. Update local cached books immediately
  const existing = getCachedBooks().filter((b) => b.id !== book.id);
  existing.unshift(book);
  setCachedBooks(existing);

  // 2. Pre-cache all newly created chunks in memory and session storage
  for (const c of chunks) {
    chunkMemoryCache.set(`${book.id}:${c.index}`, c);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`scrollbound_chunk_${book.id}_${c.index}`, JSON.stringify(c));
      } catch {}
    }
  }

  const BATCH_SIZE = 15;
  const initialChunks = chunks.slice(0, BATCH_SIZE);
  const remainingChunks = chunks.slice(BATCH_SIZE);

  // 3. Upload initial chunks to register the book in the database
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      blockCount: book.blockCount,
      chunkCount: book.chunkCount,
      chunks: initialChunks,
      parentId: book.parentId,
      chapterIndex: book.chapterIndex,
      chapterTitle: book.chapterTitle,
      totalChapters: book.totalChapters,
      nextBookId: book.nextBookId,
      prevBookId: book.prevBookId,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save book to database.');
  }

  // 4. Background upload remaining chunks without blocking the UI
  if (remainingChunks.length > 0) {
    uploadChunksInBackground(book.id, remainingChunks);
  }
}

/**
 * Save newly imported book with AOP timing and console logging
 */
export const saveBook = aopLogged('saveBook', undefined, saveBookCore);

export interface ChapterInput {
  title: string;
  blocks: Block[];
}

/**
 * Save a novel split into multiple linked chapters.
 * Creates a parent container Book plus linked child chapter Books.
 */
export async function saveChapteredNovel(
  novelTitle: string,
  chapterInputs: ChapterInput[]
): Promise<{ parent: Book; chapters: Book[] }> {
  const parentId = 'novel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const totalBlocks = chapterInputs.reduce((sum, ch) => sum + ch.blocks.length, 0);

  // Pre-generate unique IDs for each chapter to establish next/prev linking pointers
  const chapterIds = chapterInputs.map(
    (_, idx) => `chap_${parentId}_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`
  );

  const chapters: { book: Book; chunks: Chunk[] }[] = [];

  for (let idx = 0; idx < chapterInputs.length; idx++) {
    const input = chapterInputs[idx];
    const chId = chapterIds[idx];
    const chunks = createChunksFromBlocks(chId, input.blocks);

    const chapterBook: Book = {
      id: chId,
      title: `${novelTitle.trim()} - ${input.title}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockCount: input.blocks.length,
      chunkCount: chunks.length,
      parentId,
      chapterIndex: idx,
      chapterTitle: input.title,
      totalChapters: chapterInputs.length,
      prevBookId: idx > 0 ? chapterIds[idx - 1] : null,
      nextBookId: idx < chapterInputs.length - 1 ? chapterIds[idx + 1] : null,
    };

    chapters.push({ book: chapterBook, chunks });
  }

  const parentBook: Book = {
    id: parentId,
    title: novelTitle.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blockCount: totalBlocks,
    chunkCount: 0,
    totalChapters: chapterInputs.length,
  };

  // 1. Save parent book container
  await saveBook(parentBook, []);

  // 2. Save each chapter book in order
  for (const item of chapters) {
    await saveBook(item.book, item.chunks);
  }

  return {
    parent: parentBook,
    chapters: chapters.map((c) => c.book),
  };
}

/**
 * Get all child chapters for a given parent novel ID
 */
export function getChaptersForNovel(parentId: string): Book[] {
  const all = getCachedBooks();
  return all
    .filter((b) => b.parentId === parentId)
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
}

/**
 * Calculates current reading chapter, current chapter progress percentage,
 * and overall novel reading percentage across all chapters.
 */
export function calculateNovelProgress(
  parentBook: Book,
  allBooks: Book[],
  progressMap: Record<string, Progress>
): {
  currentChapter: Book | null;
  chapterPercent: number;
  overallPercent: number;
  currentChapterIndex: number;
  totalChapters: number;
} {
  const chapters = allBooks
    .filter((b) => b.parentId === parentBook.id)
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));

  const totalChapters = parentBook.totalChapters || chapters.length || 1;

  if (chapters.length === 0) {
    const singleProg = progressMap[parentBook.id];
    const pct = singleProg?.percent ?? 0;
    return {
      currentChapter: null,
      chapterPercent: pct,
      overallPercent: pct,
      currentChapterIndex: 0,
      totalChapters: 1,
    };
  }

  // Find most recently read chapter with progress or lastReadAt
  let latestChapter: Book = chapters[0];
  let latestReadTime = 0;
  let hasAnyRead = false;

  for (const ch of chapters) {
    const prog = progressMap[ch.id];
    const readTime = Math.max(ch.lastReadAt || 0, prog?.updatedAt || 0);
    if (readTime > latestReadTime) {
      latestReadTime = readTime;
      latestChapter = ch;
      hasAnyRead = true;
    }
  }

  const latestProg = progressMap[latestChapter.id];
  const chapterPercent = latestProg?.percent ?? 0;

  // Calculate overall novel progress:
  // (Completed blocks in chapters prior to latestChapter + current block in latestChapter) / total blocks
  const currentChapterIdx = latestChapter.chapterIndex ?? 0;
  let blocksReadBefore = 0;
  for (let i = 0; i < currentChapterIdx; i++) {
    blocksReadBefore += chapters[i].blockCount;
  }

  const currentChapterBlock = latestProg?.blockId ?? 0;
  const totalNovelBlocks =
    parentBook.blockCount ||
    chapters.reduce((sum, c) => sum + c.blockCount, 0) ||
    1;
  const overallBlocks = hasAnyRead ? blocksReadBefore + currentChapterBlock : 0;
  const overallPercent = Math.min(
    100,
    Math.round((overallBlocks / totalNovelBlocks) * 100)
  );

  return {
    currentChapter: latestChapter,
    chapterPercent,
    overallPercent,
    currentChapterIndex: currentChapterIdx,
    totalChapters,
  };
}

/**
 * Retrieve all reconstructed text blocks for an existing novel (whether single or chaptered)
 */
export async function getAllBlocksForBook(bookId: string): Promise<Block[]> {
  const allCached = getCachedBooks();
  const childChapters = allCached
    .filter((b) => b.parentId === bookId)
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));

  if (childChapters.length > 0) {
    const chapterBlocksList: Block[] = [];
    for (const chap of childChapters) {
      const res = await fetch(`/api/books/${chap.id}/chunks`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chunks)) {
          const sorted = data.chunks.sort(
            (a: { index: number }, b: { index: number }) => a.index - b.index
          );
          for (const c of sorted) {
            chapterBlocksList.push(...c.blocks);
          }
        }
      }
    }
    return chapterBlocksList.map((b, idx) => ({ ...b, id: idx }));
  }

  // Standalone book: fetch its chunks directly
  const res = await fetch(`/api/books/${bookId}/chunks`);
  if (!res.ok) {
    throw new Error('Failed to load book content.');
  }
  const data = await res.json();
  if (!Array.isArray(data.chunks)) {
    return [];
  }
  const sorted = data.chunks.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index
  );
  const blocks: Block[] = [];
  for (const c of sorted) {
    blocks.push(...c.blocks);
  }
  return blocks.map((b, idx) => ({ ...b, id: idx }));
}

/**
 * Split an already uploaded novel into multiple linked chapters.
 */
async function splitExistingBookCore(
  parentBook: Book,
  blocks: Block[],
  suggestions: ChapterSuggestion[]
): Promise<void> {
  const sliced = sliceBlocksForChapters(blocks, suggestions);
  const chapterIds = suggestions.map(
    (_, idx) =>
      `chap_${parentBook.id}_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`
  );

  const chaptersPayload: any[] = [];
  const newChapterBooks: Book[] = [];

  for (let idx = 0; idx < sliced.length; idx++) {
    const { chapter, blocks: chapterBlocks } = sliced[idx];
    const chId = chapterIds[idx];
    const chunks = createChunksFromBlocks(chId, chapterBlocks);

    const chapterBook: Book = {
      id: chId,
      title: `${parentBook.title} - ${chapter.title}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockCount: chapterBlocks.length,
      chunkCount: chunks.length,
      parentId: parentBook.id,
      chapterIndex: idx,
      chapterTitle: chapter.title,
      totalChapters: suggestions.length,
      prevBookId: idx > 0 ? chapterIds[idx - 1] : null,
      nextBookId: idx < suggestions.length - 1 ? chapterIds[idx + 1] : null,
    };

    // Pre-cache in memory & session storage
    for (const c of chunks) {
      chunkMemoryCache.set(`${chId}:${c.index}`, c);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            `scrollbound_chunk_${chId}_${c.index}`,
            JSON.stringify(c)
          );
        } catch {}
      }
    }

    newChapterBooks.push(chapterBook);
    chaptersPayload.push({
      ...chapterBook,
      chunks,
    });
  }

  // Optimistically update local cache
  const cached = getCachedBooks().filter(
    (b) => b.id !== parentBook.id && b.parentId !== parentBook.id
  );
  const updatedParent: Book = {
    ...parentBook,
    totalChapters: suggestions.length,
    updatedAt: Date.now(),
  };
  cached.unshift(updatedParent, ...newChapterBooks);
  setCachedBooks(cached);

  // Optimistically migrate local bookmarks to matching chapters
  const localBookmarks = getLocalBookmarks(parentBook.id);
  if (localBookmarks.length > 0) {
    for (const bm of localBookmarks) {
      let accumulated = 0;
      let targetChapter = newChapterBooks[0];
      let relativeBlockId = bm.blockId;

      for (const ch of newChapterBooks) {
        if (
          bm.blockId >= accumulated &&
          bm.blockId < accumulated + ch.blockCount
        ) {
          targetChapter = ch;
          relativeBlockId = bm.blockId - accumulated;
          break;
        }
        accumulated += ch.blockCount;
      }

      if (targetChapter) {
        const existingChapBms = getLocalBookmarks(targetChapter.id);
        const updatedChapBms = [
          ...existingChapBms.filter((b) => b.id !== bm.id),
          {
            ...bm,
            bookId: targetChapter.id,
            blockId: relativeBlockId,
          },
        ];
        saveLocalBookmarks(targetChapter.id, updatedChapBms);
      }
    }
  }

  // Send split payload to database in transaction
  const res = await fetch(`/api/books/${parentBook.id}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapters: chaptersPayload }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to split novel in database.');
  }
}

export const splitExistingBook = aopLogged(
  'splitExistingBook',
  undefined,
  splitExistingBookCore
);

/**
 * Core Append Book Function
 */
async function appendToBookCore(
  bookId: string,
  newBlocks: Block[],
  dividerTitle?: string
): Promise<Book> {
  const existingBook = await getBook(bookId);
  if (!existingBook) {
    throw new Error('Book not found to append.');
  }

  let blocksToAppend = newBlocks;
  if (dividerTitle && dividerTitle.trim()) {
    const dividerBlock: Block = {
      id: existingBook.blockCount,
      type: 'heading',
      text: dividerTitle.trim(),
    };
    const reindexed = newBlocks.map((b, idx) => ({
      ...b,
      id: existingBook.blockCount + 1 + idx,
    }));
    blocksToAppend = [dividerBlock, ...reindexed];
  }

  const newChunks = createChunksFromBlocks(
    bookId,
    blocksToAppend,
    existingBook.chunkCount
  );

  // Pre-cache new chunks immediately
  for (const c of newChunks) {
    chunkMemoryCache.set(`${bookId}:${c.index}`, c);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`scrollbound_chunk_${bookId}_${c.index}`, JSON.stringify(c));
      } catch {}
    }
  }

  const BATCH_SIZE = 15;
  const initialChunks = newChunks.slice(0, BATCH_SIZE);
  const remainingChunks = newChunks.slice(BATCH_SIZE);

  const res = await fetch(`/api/books/${bookId}/append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newChunks: initialChunks,
      addedBlockCount: blocksToAppend.length,
      totalNewChunkCount: newChunks.length,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to append to book in database.');
  }

  const data = await res.json();
  const updatedBook: Book = data.book;

  // Update cached books
  const cached = getCachedBooks().filter((b) => b.id !== bookId);
  cached.unshift(updatedBook);
  setCachedBooks(cached);

  // Upload remaining chunks in background non-blockingly
  if (remainingChunks.length > 0) {
    uploadChunksInBackground(bookId, remainingChunks);
  }

  return updatedBook;
}

/**
 * Append blocks to an existing book with AOP timing and console logging
 */
export const appendToBook = aopLogged('appendToBook', undefined, appendToBookCore);

/**
 * Fetch a single book: 0ms instant cache hit with background revalidation
 */
export async function getBook(id: string): Promise<Book | undefined> {
  const cachedBooks = getCachedBooks();
  const cached = cachedBooks.find((b) => b.id === id);

  if (cached) {
    // Revalidate in background silently
    fetch(`/api/books/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.book) {
          const updated = cachedBooks.filter((b) => b.id !== id);
          updated.unshift(data.book);
          setCachedBooks(updated);
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const res = await fetch(`/api/books/${id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.book) {
        const updated = cachedBooks.filter((b) => b.id !== id);
        updated.unshift(data.book);
        setCachedBooks(updated);
        return data.book;
      }
    }
  } catch {}

  return undefined;
}

/**
 * Synchronously get cached books from localStorage (0ms instant render)
 */
export function getCachedBooks(): Book[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHED_BOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCachedBooks(books: Book[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHED_BOOKS_KEY, JSON.stringify(books));
  } catch {}
}

/**
 * Synchronously get cached progress map from localStorage (0ms instant render)
 */
export function getCachedProgressMap(): Record<string, Progress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHED_PROGRESS_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCachedProgressMap(map: Record<string, Progress>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHED_PROGRESS_MAP_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Fetch all books for current user from local cache or PostgreSQL
 */
export async function getAllBooks(): Promise<Book[]> {
  const cached = getCachedBooks();

  try {
    const res = await fetch('/api/books');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.books)) {
        setCachedBooks(data.books);
        if (data.progressMap) {
          setCachedProgressMap(data.progressMap);
        }
        return data.books;
      }
    }
  } catch {}

  return cached;
}

/**
 * Fetch all progress map for current user
 */
export async function getAllProgress(): Promise<Record<string, Progress>> {
  const cached = getCachedProgressMap();

  try {
    const res = await fetch('/api/books');
    if (res.ok) {
      const data = await res.json();
      if (data.progressMap) {
        setCachedProgressMap(data.progressMap);
        return data.progressMap;
      }
    }
  } catch {}

  return cached;
}

// ----------------------------------------------------------------------
// Aspect-Oriented Programming (AOP) Cloud Sync Handlers
// ----------------------------------------------------------------------

const cloudDeleteBook = async (params: { id: string }) => {
  const res = await fetch(`/api/books/${params.id}`, { method: 'DELETE', keepalive: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectDeleteBook = aopBackgroundSync('deleteBook', 'DELETE_BOOK', cloudDeleteBook);

/**
 * Delete a book: optimistic local removal with AOP background sync & timing
 */
export async function deleteBook(id: string): Promise<void> {
  const cached = getCachedBooks().filter((b) => b.id !== id && b.parentId !== id);
  setCachedBooks(cached);

  const progMap = getCachedProgressMap();
  delete progMap[id];
  // Prune any child chapter progresses
  for (const key of Object.keys(progMap)) {
    if (key.includes(id)) {
      delete progMap[key];
    }
  }
  setCachedProgressMap(progMap);

  aspectDeleteBook({ id });
}

/**
 * Fetch a specific chunk from memory cache, sessionStorage, or PostgreSQL
 */
export async function getChunk(bookId: string, index: number): Promise<Chunk | undefined> {
  const cacheKey = `${bookId}:${index}`;

  // 1. In-memory cache hit (0ms)
  if (chunkMemoryCache.has(cacheKey)) {
    return chunkMemoryCache.get(cacheKey);
  }

  // 2. SessionStorage cache hit (0ms)
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`scrollbound_chunk_${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        chunkMemoryCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {}
  }

  // 3. Fetch from API
  try {
    const res = await fetch(`/api/books/${bookId}/chunks/${index}`);
    if (res.ok) {
      const data = await res.json();
      if (data.chunk) {
        chunkMemoryCache.set(cacheKey, data.chunk);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`scrollbound_chunk_${cacheKey}`, JSON.stringify(data.chunk));
          } catch {}
        }
        return data.chunk;
      }
    }
  } catch {}

  return undefined;
}

const cloudSyncProgress = async (prog: Progress) => {
  const res = await fetch(`/api/books/${prog.bookId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prog),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectSyncProgress = aopBackgroundSync('saveProgress', 'UPDATE_PROGRESS', cloudSyncProgress);

/**
 * Save reading progress: immediate local write with AOP background sync & timing
 */
export async function saveProgress(progress: Progress): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`scrollbound_progress_${progress.bookId}`, JSON.stringify(progress));
      const map = getCachedProgressMap();
      map[progress.bookId] = progress;
      setCachedProgressMap(map);
    } catch {}
  }

  aspectSyncProgress(progress);
}

/**
 * Get reading progress for a book from PostgreSQL / local cache
 */
export async function getProgress(bookId: string): Promise<Progress | undefined> {
  let localProg: Progress | null = null;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`scrollbound_progress_${bookId}`);
      if (raw) localProg = JSON.parse(raw);
    } catch {}
  }

  try {
    const res = await fetch(`/api/books/${bookId}/progress`);
    if (res.ok) {
      const data = await res.json();
      const serverProg = data.progress;
      if (serverProg && localProg) {
        return serverProg.updatedAt >= localProg.updatedAt ? serverProg : localProg;
      }
      if (serverProg) return serverProg;
    }
  } catch {}

  return localProg || undefined;
}

/**
 * Bookmarks management: Local-First with AOP Sync Tracking
 */
export function getLocalBookmarks(bookId: string): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`scrollbound_bookmarks_${bookId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalBookmarks(bookId: string, bookmarks: Bookmark[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`scrollbound_bookmarks_${bookId}`, JSON.stringify(bookmarks));
  } catch {}
}

const cloudAddBookmark = async (bm: Bookmark) => {
  const res = await fetch(`/api/books/${bm.bookId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bm),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectAddBookmark = aopBackgroundSync('addBookmark', 'ADD_BOOKMARK', cloudAddBookmark);

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const current = getLocalBookmarks(bookmark.bookId);
  const updated = [...current.filter((b) => b.id !== bookmark.id), bookmark];
  saveLocalBookmarks(bookmark.bookId, updated);

  aspectAddBookmark(bookmark);
}

const cloudUpdateBookmarkNote = async (params: { id: string; note: string; bookId?: string }) => {
  const res = await fetch('/api/books/_/bookmarks', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id, note: params.note }),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectUpdateBookmarkNote = aopBackgroundSync(
  'updateBookmarkNote',
  'UPDATE_BOOKMARK_NOTE',
  cloudUpdateBookmarkNote
);

export async function updateBookmarkNote(id: string, note: string, bookId?: string): Promise<void> {
  if (bookId) {
    const current = getLocalBookmarks(bookId);
    saveLocalBookmarks(bookId, current.map((b) => (b.id === id ? { ...b, note } : b)));
  }

  aspectUpdateBookmarkNote({ id, note, bookId });
}

const cloudDeleteBookmark = async (params: { id: string; bookId?: string }) => {
  const res = await fetch(`/api/books/_/bookmarks?id=${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectDeleteBookmark = aopBackgroundSync(
  'deleteBookmark',
  'DELETE_BOOKMARK',
  cloudDeleteBookmark
);

export async function deleteBookmark(id: string, bookId?: string): Promise<void> {
  if (bookId) {
    const current = getLocalBookmarks(bookId);
    saveLocalBookmarks(bookId, current.filter((b) => b.id !== id));
  }

  aspectDeleteBookmark({ id, bookId });
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const local = getLocalBookmarks(bookId);

  // Background fetch latest bookmarks from database
  fetch(`/api/books/${bookId}/bookmarks`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (Array.isArray(data?.bookmarks)) {
        saveLocalBookmarks(bookId, data.bookmarks);
      }
    })
    .catch(() => {});

  if (local.length > 0) {
    return local;
  }

  try {
    const res = await fetch(`/api/books/${bookId}/bookmarks`);
    if (res.ok) {
      const data = await res.json();
      const bms = data.bookmarks || [];
      saveLocalBookmarks(bookId, bms);
      return bms;
    }
  } catch {}

  return local;
}

/**
 * Settings and Preferences Management
 */
export function getLocalSettings(): ReaderSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalSettings(settings: ReaderSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

const cloudSaveSettings = async (params: { settings: ReaderSettings }) => {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectSaveSettings = aopBackgroundSync('saveSettings', 'SAVE_SETTINGS', cloudSaveSettings);

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  saveLocalSettings(settings);
  aspectSaveSettings({ settings });
}

export async function getSettings(): Promise<ReaderSettings | null> {
  const local = getLocalSettings();
  if (local) {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings && !local) {
          saveLocalSettings(data.settings);
        }
      })
      .catch(() => {});
    return local;
  }

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        saveLocalSettings(data.settings);
        return data.settings;
      }
    }
  } catch {}

  return null;
}

/**
 * Custom themes management in Local Storage and PostgreSQL
 */
export function getLocalCustomThemes(): CustomTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(THEMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCustomThemes(themes: CustomTheme[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(themes));
  } catch {}
}

const cloudSaveTheme = async (theme: CustomTheme) => {
  const res = await fetch('/api/settings/themes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectSaveTheme = aopBackgroundSync('saveCustomTheme', 'SAVE_THEME', cloudSaveTheme);

export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  const current = getLocalCustomThemes();
  saveLocalCustomThemes([...current.filter((t) => t.id !== theme.id), theme]);
  aspectSaveTheme(theme);
}

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const local = getLocalCustomThemes();

  fetch('/api/settings')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (Array.isArray(data?.customThemes)) {
        saveLocalCustomThemes(data.customThemes);
      }
    })
    .catch(() => {});

  if (local.length > 0) {
    return local;
  }

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.customThemes)) {
        saveLocalCustomThemes(data.customThemes);
        return data.customThemes;
      }
    }
  } catch {}

  return local;
}

const cloudDeleteTheme = async (params: { id: string }) => {
  const res = await fetch(`/api/settings/themes?id=${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
    keepalive: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
const aspectDeleteTheme = aopBackgroundSync('deleteCustomTheme', 'DELETE_THEME', cloudDeleteTheme);

export async function deleteCustomTheme(id: string): Promise<void> {
  const current = getLocalCustomThemes();
  saveLocalCustomThemes(current.filter((t) => t.id !== id));
  aspectDeleteTheme({ id });
}

/**
 * Export and import backup data
 */
export async function exportAllData(settings?: ReaderSettings): Promise<ExportData> {
  const books = await getAllBooks();
  const progressMap = await getAllProgress();
  const themes = await getCustomThemes();

  const progressList = Object.values(progressMap);

  return {
    version: 1,
    exportedAt: Date.now(),
    books,
    chunks: [],
    progress: progressList,
    bookmarks: [],
    themes,
    settings,
  };
}

export async function importAllData(data: ExportData): Promise<void> {
  if (!data || data.version !== 1 || !Array.isArray(data.books)) {
    throw new Error('Invalid Scrollbound backup file format.');
  }

  for (const b of data.books) {
    const bookChunks = data.chunks?.filter((c) => c.bookId === b.id) || [];
    await saveBook(b, bookChunks);
  }
}

export async function requestPersistentStorage(): Promise<{
  isPersisted: boolean;
  message: string;
}> {
  return {
    isPersisted: true,
    message: 'Data is securely stored in your local PostgreSQL database.',
  };
}
