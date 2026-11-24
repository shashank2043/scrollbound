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
 * Save newly imported book to PostgreSQL via API
 * Chunks are batched to respect serverless payload limits on Vercel
 */
export async function saveBook(book: Book, chunks: Chunk[]): Promise<void> {
  const BATCH_SIZE = 15;
  const initialChunks = chunks.slice(0, BATCH_SIZE);
  const remainingChunks = chunks.slice(BATCH_SIZE);

  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      blockCount: book.blockCount,
      chunkCount: book.chunkCount,
      chunks: initialChunks,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save book to database.');
  }

  // Upload remaining chunks in batches if any (for large novels)
  for (let i = 0; i < remainingChunks.length; i += BATCH_SIZE) {
    const batch = remainingChunks.slice(i, i + BATCH_SIZE);
    const batchRes = await fetch(`/api/books/${book.id}/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunks: batch }),
    });

    if (!batchRes.ok) {
      const data = await batchRes.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to upload book chunks.');
    }
  }
}

/**
 * Append blocks to an existing book in PostgreSQL
 */
export async function appendToBook(
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

  // Upload remaining chunks in batches if any
  for (let i = 0; i < remainingChunks.length; i += BATCH_SIZE) {
    const batch = remainingChunks.slice(i, i + BATCH_SIZE);
    const batchRes = await fetch(`/api/books/${bookId}/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunks: batch }),
    });

    if (!batchRes.ok) {
      const data = await batchRes.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to upload appended chunks.');
    }
  }

  const data = await res.json();
  return data.book;
}

/**
 * Fetch a single book from PostgreSQL
 */
export async function getBook(id: string): Promise<Book | undefined> {
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.book;
}

/**
 * Fetch all books for current user from PostgreSQL
 */
export async function getAllBooks(): Promise<Book[]> {
  const res = await fetch('/api/books');
  if (!res.ok) return [];
  const data = await res.json();
  return data.books || [];
}

/**
 * Fetch all progress map for current user
 */
export async function getAllProgress(): Promise<Record<string, Progress>> {
  const res = await fetch('/api/books');
  if (!res.ok) return {};
  const data = await res.json();
  return data.progressMap || {};
}

/**
 * Delete a book from PostgreSQL
 */
export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete book.');
  }
}

/**
 * Fetch a specific chunk from PostgreSQL
 */
export async function getChunk(bookId: string, index: number): Promise<Chunk | undefined> {
  const res = await fetch(`/api/books/${bookId}/chunks/${index}`);
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.chunk || undefined;
}

/**
 * Save reading progress for a book in PostgreSQL with immediate local cache and keepalive
 */
export async function saveProgress(progress: Progress): Promise<void> {
  // 1. Synchronously save to local storage for 0ms latency resilience
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        `scrollbound_progress_${progress.bookId}`,
        JSON.stringify(progress)
      );
    } catch {}
  }

  // 2. Persist to PostgreSQL backend via API with keepalive
  try {
    await fetch(`/api/books/${progress.bookId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
      keepalive: true,
    });
  } catch (err) {
    console.error('Error saving progress to database:', err);
  }
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
 * Bookmarks management in PostgreSQL
 */
export async function addBookmark(bookmark: Bookmark): Promise<void> {
  await fetch(`/api/books/${bookmark.bookId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookmark),
  });
}

export async function updateBookmarkNote(id: string, note: string): Promise<void> {
  await fetch('/api/books/_/bookmarks', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, note }),
  });
}

export async function deleteBookmark(id: string): Promise<void> {
  await fetch(`/api/books/_/bookmarks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const res = await fetch(`/api/books/${bookId}/bookmarks`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.bookmarks || [];
}

/**
 * Custom themes management in PostgreSQL
 */
export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  await fetch('/api/settings/themes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
  });
}

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const res = await fetch('/api/settings');
  if (!res.ok) return [];
  const data = await res.json();
  return data.customThemes || [];
}

export async function deleteCustomTheme(id: string): Promise<void> {
  await fetch(`/api/settings/themes?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
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
    chunks: [], // chunks are stored in PostgreSQL
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
