import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Book,
  Chunk,
  Progress,
  Bookmark,
  CustomTheme,
  ExportData,
  ReaderSettings,
  Block,
} from './types';

export const CHUNK_SIZE = 200;

interface ScrollboundDB extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { 'by_updated': number };
  };
  chunks: {
    key: string; // `${bookId}:${index}`
    value: Chunk;
    indexes: { 'by_bookId': string };
  };
  progress: {
    key: string; // bookId
    value: Progress;
  };
  bookmarks: {
    key: string; // id
    value: Bookmark;
    indexes: { 'by_bookId': string; 'by_bookId_blockId': [string, number] };
  };
  themes: {
    key: string; // id
    value: CustomTheme;
  };
}

const DB_NAME = 'scrollbound-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ScrollboundDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ScrollboundDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only accessible in the browser.');
  }

  if (!dbPromise) {
    dbPromise = openDB<ScrollboundDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Books
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_updated', 'updatedAt');
        }

        // Chunks
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunkStore.createIndex('by_bookId', 'bookId');
        }

        // Progress
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'bookId' });
        }

        // Bookmarks
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarkStore.createIndex('by_bookId', 'bookId');
          bookmarkStore.createIndex('by_bookId_blockId', ['bookId', 'blockId']);
        }

        // Themes
        if (!db.objectStoreNames.contains('themes')) {
          db.createObjectStore('themes', { keyPath: 'id' });
        }
      },
    });
  }

  return dbPromise;
}

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
 * Save a newly imported book with its chunks in a single transaction
 */
export async function saveBook(book: Book, chunks: Chunk[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'chunks'], 'readwrite');

  await tx.objectStore('books').put(book);
  for (const chunk of chunks) {
    await tx.objectStore('chunks').put(chunk);
  }

  await tx.done;
}

/**
 * Append new chunks to an existing book
 */
export async function appendToBook(
  bookId: string,
  newBlocks: Block[],
  dividerTitle?: string
): Promise<Book> {
  const db = await getDb();
  const existingBook = await db.get('books', bookId);
  if (!existingBook) {
    throw new Error('Book not found to append.');
  }

  // Prepend divider heading if provided
  let blocksToAppend = newBlocks;
  if (dividerTitle && dividerTitle.trim()) {
    const dividerBlock: Block = {
      id: existingBook.blockCount,
      type: 'heading',
      text: dividerTitle.trim(),
    };
    // Re-index new blocks starting after divider
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

  const updatedBook: Book = {
    ...existingBook,
    blockCount: existingBook.blockCount + blocksToAppend.length,
    chunkCount: existingBook.chunkCount + newChunks.length,
    updatedAt: Date.now(),
  };

  const tx = db.transaction(['books', 'chunks'], 'readwrite');
  await tx.objectStore('books').put(updatedBook);
  for (const chunk of newChunks) {
    await tx.objectStore('chunks').put(chunk);
  }
  await tx.done;

  return updatedBook;
}

/**
 * Fetch a single book metadata
 */
export async function getBook(id: string): Promise<Book | undefined> {
  const db = await getDb();
  return db.get('books', id);
}

/**
 * Fetch all books, sorted by last read or update time descending
 */
export async function getAllBooks(): Promise<Book[]> {
  const db = await getDb();
  const books = await db.getAll('books');
  return books.sort((a, b) => (b.lastReadAt || b.updatedAt) - (a.lastReadAt || a.updatedAt));
}

/**
 * Delete a book and all associated chunks, progress, and bookmarks
 */
export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'chunks', 'progress', 'bookmarks'], 'readwrite');

  await tx.objectStore('books').delete(id);
  await tx.objectStore('progress').delete(id);

  // Delete all chunks for this book
  const chunkIndex = tx.objectStore('chunks').index('by_bookId');
  let chunkCursor = await chunkIndex.openCursor(id);
  while (chunkCursor) {
    await chunkCursor.delete();
    chunkCursor = await chunkCursor.continue();
  }

  // Delete all bookmarks for this book
  const bookmarkIndex = tx.objectStore('bookmarks').index('by_bookId');
  let bmCursor = await bookmarkIndex.openCursor(id);
  while (bmCursor) {
    await bmCursor.delete();
    bmCursor = await bmCursor.continue();
  }

  await tx.done;
}

/**
 * Get a specific chunk by bookId and index
 */
export async function getChunk(bookId: string, index: number): Promise<Chunk | undefined> {
  const db = await getDb();
  return db.get('chunks', `${bookId}:${index}`);
}

/**
 * Get all chunks for a book, ordered by index
 */
export async function getBookChunks(bookId: string): Promise<Chunk[]> {
  const db = await getDb();
  const chunks = await db.getAllFromIndex('chunks', 'by_bookId', bookId);
  return chunks.sort((a, b) => a.index - b.index);
}

/**
 * Save reading progress for a book
 */
export async function saveProgress(progress: Progress): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['progress', 'books'], 'readwrite');

  await tx.objectStore('progress').put(progress);

  const book = await tx.objectStore('books').get(progress.bookId);
  if (book) {
    book.lastReadAt = progress.updatedAt;
    await tx.objectStore('books').put(book);
  }

  await tx.done;
}

/**
 * Get reading progress for a book
 */
export async function getProgress(bookId: string): Promise<Progress | undefined> {
  const db = await getDb();
  return db.get('progress', bookId);
}

/**
 * Get all progress records
 */
export async function getAllProgress(): Promise<Record<string, Progress>> {
  const db = await getDb();
  const all = await db.getAll('progress');
  const map: Record<string, Progress> = {};
  for (const p of all) {
    map[p.bookId] = p;
  }
  return map;
}

/**
 * Add a new bookmark
 */
export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', bookmark);
}

/**
 * Update bookmark note
 */
export async function updateBookmarkNote(id: string, note: string): Promise<void> {
  const db = await getDb();
  const bm = await db.get('bookmarks', id);
  if (bm) {
    bm.note = note;
    await db.put('bookmarks', bm);
  }
}

/**
 * Delete a bookmark
 */
export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

/**
 * Get all bookmarks for a specific book
 */
export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const db = await getDb();
  const bookmarks = await db.getAllFromIndex('bookmarks', 'by_bookId', bookId);
  return bookmarks.sort((a, b) => a.blockId - b.blockId);
}

/**
 * Custom themes management
 */
export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  const db = await getDb();
  await db.put('themes', theme);
}

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const db = await getDb();
  return db.getAll('themes');
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('themes', id);
}

/**
 * Export all app data (books, chunks, progress, bookmarks, themes) as a single JSON object
 */
export async function exportAllData(settings?: ReaderSettings): Promise<ExportData> {
  const db = await getDb();
  const [books, chunks, progress, bookmarks, themes] = await Promise.all([
    db.getAll('books'),
    db.getAll('chunks'),
    db.getAll('progress'),
    db.getAll('bookmarks'),
    db.getAll('themes'),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    books,
    chunks,
    progress,
    bookmarks,
    themes,
    settings,
  };
}

/**
 * Import all app data from JSON
 */
export async function importAllData(data: ExportData): Promise<void> {
  if (!data || data.version !== 1 || !Array.isArray(data.books)) {
    throw new Error('Invalid Scrollbound backup file format.');
  }

  const db = await getDb();
  const tx = db.transaction(['books', 'chunks', 'progress', 'bookmarks', 'themes'], 'readwrite');

  for (const b of data.books) {
    await tx.objectStore('books').put(b);
  }
  for (const c of data.chunks) {
    await tx.objectStore('chunks').put(c);
  }
  for (const p of data.progress) {
    await tx.objectStore('progress').put(p);
  }
  for (const bm of data.bookmarks) {
    await tx.objectStore('bookmarks').put(bm);
  }
  for (const t of data.themes) {
    await tx.objectStore('themes').put(t);
  }

  await tx.done;
}

/**
 * Request persistent browser storage so IndexedDB isn't evicted under storage pressure
 */
export async function requestPersistentStorage(): Promise<{
  isPersisted: boolean;
  message: string;
}> {
  if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return {
      isPersisted: false,
      message: 'Persistent storage API is not supported in this browser.',
    };
  }

  try {
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) {
      return { isPersisted: true, message: 'Persistent storage is already granted.' };
    }

    const granted = await navigator.storage.persist();
    return {
      isPersisted: granted,
      message: granted
        ? 'Persistent storage granted successfully.'
        : 'Browser denied persistent storage request (permission may depend on browser usage or bookmarking).',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isPersisted: false, message: `Storage request error: ${msg}` };
  }
}
