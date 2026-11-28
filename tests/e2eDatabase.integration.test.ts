import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../src/lib/prisma';
import { auth } from '../src/lib/auth';
import { createChunksFromBlocks } from '../src/lib/db';
import { detectChapters, sliceBlocksForChapters } from '../src/lib/chapterDetector';
import { Block } from '../src/lib/types';
import { POST as createBookRoute, GET as getBooksRoute } from '../src/app/api/books/route';
import { DELETE as deleteBookRoute } from '../src/app/api/books/[bookId]/route';
import { GET as getChunksRoute, POST as postChunksRoute } from '../src/app/api/books/[bookId]/chunks/route';
import { POST as splitRoute } from '../src/app/api/books/[bookId]/split/route';
import { GET as getProfileRoute, DELETE as deleteProfileRoute } from '../src/app/api/auth/profile/route';

describe('End-to-End Real Backend Route & Database Upload/Split Pipeline', () => {
  let testUserId: string;
  let sessionCookie: string;
  const testEmail = `test_e2e_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@scrollbound.test`;
  const parentBookId = `book_e2e_${Date.now()}`;

  function makeRequest(url: string, method: string, body?: unknown): Request {
    const headers = new Headers({
      'Content-Type': 'application/json',
      cookie: sessionCookie,
    });
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // 1. Account Creation & Real Session Sign-up (Setup)
  before(async () => {
    const signUpRes = await auth.api.signUpEmail({
      body: {
        name: 'E2E Full Lifecycle Tester',
        email: testEmail,
        password: 'StrongPassword123!@#',
      },
      asResponse: true,
    });

    assert.strictEqual(signUpRes.status, 200, 'User sign up must succeed with 200');

    // Extract the signed session cookie
    const rawCookies = signUpRes.headers.get('set-cookie') || '';
    // Format cookies into a standard Cookie header (joining by semicolon)
    sessionCookie = rawCookies
      .split(/,\s*(?=[a-zA-Z0-9_\-]+=)/)
      .map((c) => c.split(';')[0])
      .join('; ');

    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    assert.ok(createdUser);
    testUserId = createdUser!.id;

    console.log(`[E2E Test] Registered test user & signed session: ${testUserId} (${testEmail})`);
  });

  // Complete Clean-up (Zero Residue)
  after(async () => {
    if (testUserId) {
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
      console.log(`[E2E Test] Cleaned up test user: ${testUserId} (Zero residue left)`);

      const remainingUser = await prisma.user.findUnique({ where: { id: testUserId } });
      const remainingBooks = await prisma.book.findMany({ where: { userId: testUserId } });
      const remainingSessions = await prisma.session.findMany({ where: { userId: testUserId } });
      assert.strictEqual(remainingUser, null, 'User must be deleted');
      assert.strictEqual(remainingBooks.length, 0, 'No books must remain');
      assert.strictEqual(remainingSessions.length, 0, 'No sessions must remain');
    }
  });

  it('uploads a complete novel via backend route POST /api/books with initial and background chunks', async () => {
    // Generate 600 blocks simulating an uploaded serialized novel
    const dummyBlocks: Block[] = [];
    for (let i = 0; i < 600; i++) {
      if (i % 60 === 0) {
        const chapNum = 1410 + Math.floor(i / 60) + 1;
        dummyBlocks.push({
          id: i,
          type: 'heading',
          text: `Chapter ${chapNum}`,
        });
      } else {
        dummyBlocks.push({
          id: i,
          type: 'paragraph',
          text: `Paragraph content line ${i} of the novel story.`,
        });
      }
    }

    const chunks = createChunksFromBlocks(parentBookId, dummyBlocks);
    const initialChunks = chunks.slice(0, 5);
    const remainingChunks = chunks.slice(5);

    // Call POST /api/books route handler
    const createReq = makeRequest('http://localhost:3000/api/books', 'POST', {
      id: parentBookId,
      title: 'Fantasy Epic Novel Full Route E2E',
      blockCount: dummyBlocks.length,
      chunkCount: chunks.length,
      chunks: initialChunks,
    });

    const createRes = await createBookRoute(createReq);
    assert.strictEqual(createRes.status, 200, 'POST /api/books must return 200');

    const createData = (await createRes.json()) as { book: { id: string; title: string } };
    assert.strictEqual(createData.book.id, parentBookId);

    // Call POST /api/books/[bookId]/chunks route handler for remaining chunks
    if (remainingChunks.length > 0) {
      const chunksReq = makeRequest(
        `http://localhost:3000/api/books/${parentBookId}/chunks`,
        'POST',
        { chunks: remainingChunks }
      );
      const chunksRes = await postChunksRoute(chunksReq, {
        params: Promise.resolve({ bookId: parentBookId }),
      });
      assert.strictEqual(chunksRes.status, 200, 'POST /api/books/[bookId]/chunks must return 200');
    }

    // Call GET /api/books/[bookId]/chunks route handler to verify all chunks
    const getChunksReq = makeRequest(
      `http://localhost:3000/api/books/${parentBookId}/chunks`,
      'GET'
    );
    const getChunksRes = await getChunksRoute(getChunksReq, {
      params: Promise.resolve({ bookId: parentBookId }),
    });
    assert.strictEqual(getChunksRes.status, 200, 'GET /api/books/[bookId]/chunks must return 200');

    const getChunksData = (await getChunksRes.json()) as { chunks: unknown[] };
    assert.strictEqual(getChunksData.chunks.length, chunks.length);
  });

  it('records reading progress at block 150 and creates bookmarks before split', async () => {
    await prisma.progress.upsert({
      where: {
        userId_bookId: {
          userId: testUserId,
          bookId: parentBookId,
        },
      },
      update: {
        blockId: 150,
        offset: 0.1,
        percent: 25,
      },
      create: {
        userId: testUserId,
        bookId: parentBookId,
        blockId: 150,
        offset: 0.1,
        percent: 25,
      },
    });

    // Create 3 bookmarks at different block locations before split
    await prisma.bookmark.createMany({
      data: [
        {
          id: `bm_test_1_${Date.now()}`,
          userId: testUserId,
          bookId: parentBookId,
          blockId: 25,
          snippet: 'Early discovery in chapter 1',
          note: 'Key plot point',
        },
        {
          id: `bm_test_2_${Date.now()}`,
          userId: testUserId,
          bookId: parentBookId,
          blockId: 150,
          snippet: 'Grid swung his greatsword',
          note: 'Epic battle moment',
        },
        {
          id: `bm_test_3_${Date.now()}`,
          userId: testUserId,
          bookId: parentBookId,
          blockId: 320,
          snippet: 'The realm shook with thunder',
          note: 'Climactic scene',
        },
      ],
    });

    const bms = await prisma.bookmark.findMany({
      where: { userId: testUserId, bookId: parentBookId },
    });
    assert.strictEqual(bms.length, 3, 'Must have 3 pre-split bookmarks created');

    const prog = await prisma.progress.findUnique({
      where: {
        userId_bookId: {
          userId: testUserId,
          bookId: parentBookId,
        },
      },
    });
    assert.strictEqual(prog?.blockId, 150);
  });

  it('splits the uploaded novel into 10 chapters using backend route POST /api/books/[bookId]/split', async () => {
    // 1. Fetch chunks via GET /api/books/[bookId]/chunks
    const getChunksReq = makeRequest(
      `http://localhost:3000/api/books/${parentBookId}/chunks`,
      'GET'
    );
    const getChunksRes = await getChunksRoute(getChunksReq, {
      params: Promise.resolve({ bookId: parentBookId }),
    });
    const { chunks: savedChunks } = (await getChunksRes.json()) as {
      chunks: { id: string; index: number; blocks: Block[] }[];
    };

    const allBlocks: Block[] = [];
    const sorted = savedChunks.sort((a, b) => a.index - b.index);
    for (const c of sorted) {
      allBlocks.push(...c.blocks);
    }
    assert.strictEqual(allBlocks.length, 600);

    // 2. Detect chapters
    const suggestions = detectChapters(allBlocks);
    assert.strictEqual(suggestions.length, 10);

    // 3. Slice blocks into 10 chapters
    const sliced = sliceBlocksForChapters(allBlocks, suggestions);
    const chapterIds = suggestions.map((_, idx) => `chap_${parentBookId}_${idx + 1}`);

    const chapterPayloads = sliced.map((s, idx) => {
      const chId = chapterIds[idx];
      const chunks = createChunksFromBlocks(chId, s.blocks);
      return {
        id: chId,
        title: `Fantasy Epic E2E - ${s.chapter.title}`,
        chapterIndex: idx,
        chapterTitle: s.chapter.title,
        prevBookId: idx > 0 ? chapterIds[idx - 1] : null,
        nextBookId: idx < sliced.length - 1 ? chapterIds[idx + 1] : null,
        blockCount: s.blocks.length,
        chunkCount: chunks.length,
        chunks,
      };
    });

    // 4. Call POST /api/books/[bookId]/split backend route handler
    const t0 = performance.now();
    const splitReq = makeRequest(
      `http://localhost:3000/api/books/${parentBookId}/split`,
      'POST',
      { chapters: chapterPayloads }
    );

    const splitRes = await splitRoute(splitReq, {
      params: Promise.resolve({ bookId: parentBookId }),
    });
    assert.strictEqual(splitRes.status, 200, 'POST /api/books/[bookId]/split must return 200');

    const splitData = (await splitRes.json()) as { success: boolean; chaptersCount: number };
    assert.strictEqual(splitData.success, true);
    assert.strictEqual(splitData.chaptersCount, 10);

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[E2E Test] Backend split route completed successfully in ${elapsed}ms`);

    // Verify reading progress migrated from block 150 to Chapter 3 (index 2: block 30)
    const chapter3 = await prisma.book.findFirst({
      where: { parentId: parentBookId, chapterIndex: 2 },
    });
    assert.ok(chapter3);

    const migratedProgress = await prisma.progress.findUnique({
      where: {
        userId_bookId: {
          userId: testUserId,
          bookId: chapter3!.id,
        },
      },
    });
    assert.ok(migratedProgress);
    assert.strictEqual(migratedProgress!.blockId, 30);

    // Verify bookmarks migrated intact to their respective chapters
    const chapter1 = await prisma.book.findFirst({
      where: { parentId: parentBookId, chapterIndex: 0 },
    });
    const chapter6 = await prisma.book.findFirst({
      where: { parentId: parentBookId, chapterIndex: 5 },
    });
    assert.ok(chapter1);
    assert.ok(chapter6);

    // Bookmark 1: was at block 25 on parent -> now at block 25 on Chapter 1
    const bm1 = await prisma.bookmark.findFirst({
      where: { userId: testUserId, bookId: chapter1!.id },
    });
    assert.ok(bm1, 'Bookmark 1 must be migrated to Chapter 1');
    assert.strictEqual(bm1!.blockId, 25);
    assert.strictEqual(bm1!.snippet, 'Early discovery in chapter 1');
    assert.strictEqual(bm1!.note, 'Key plot point');

    // Bookmark 2: was at block 150 on parent -> now at block 30 on Chapter 3
    const bm2 = await prisma.bookmark.findFirst({
      where: { userId: testUserId, bookId: chapter3!.id },
    });
    assert.ok(bm2, 'Bookmark 2 must be migrated to Chapter 3');
    assert.strictEqual(bm2!.blockId, 30);
    assert.strictEqual(bm2!.snippet, 'Grid swung his greatsword');
    assert.strictEqual(bm2!.note, 'Epic battle moment');

    // Bookmark 3: was at block 320 on parent -> now at block 20 on Chapter 6
    const bm3 = await prisma.bookmark.findFirst({
      where: { userId: testUserId, bookId: chapter6!.id },
    });
    assert.ok(bm3, 'Bookmark 3 must be migrated to Chapter 6');
    assert.strictEqual(bm3!.blockId, 20);
    assert.strictEqual(bm3!.snippet, 'The realm shook with thunder');
    assert.strictEqual(bm3!.note, 'Climactic scene');
  });

  it('fetches library novels via GET /api/books backend route and verifies composite metadata', async () => {
    const getBooksReq = makeRequest('http://localhost:3000/api/books', 'GET');
    const getBooksRes = await getBooksRoute(getBooksReq);
    assert.strictEqual(getBooksRes.status, 200, 'GET /api/books must return 200');

    const data = (await getBooksRes.json()) as {
      books: { id: string; parentId?: string; totalChapters?: number }[];
      progressMap: Record<string, { percent: number; blockId: number }>;
    };

    assert.ok(Array.isArray(data.books));
    const parent = data.books.find((b) => b.id === parentBookId);
    assert.ok(parent);
    assert.strictEqual(parent!.totalChapters, 10);

    // 10 chapters exist under parent
    const childChapters = data.books.filter((b) => b.parentId === parentBookId);
    assert.strictEqual(childChapters.length, 10);
  });

  it('deletes novel via backend route DELETE /api/books/[bookId] and cascades deletion', async () => {
    const deleteReq = makeRequest(
      `http://localhost:3000/api/books/${parentBookId}`,
      'DELETE'
    );
    const deleteRes = await deleteBookRoute(deleteReq, {
      params: Promise.resolve({ bookId: parentBookId }),
    });
    assert.strictEqual(deleteRes.status, 200, 'DELETE /api/books/[bookId] must return 200');

    // Verify parent is gone
    const parent = await prisma.book.findUnique({ where: { id: parentBookId } });
    assert.strictEqual(parent, null);

    // Verify child chapters are gone
    const chapters = await prisma.book.findMany({ where: { parentId: parentBookId } });
    assert.strictEqual(chapters.length, 0);

    // Verify chunks are gone
    const chunks = await prisma.chunk.findMany({ where: { bookId: parentBookId } });
    assert.strictEqual(chunks.length, 0);
  });

  it('retrieves user profile and account details via GET /api/auth/profile', async () => {
    const profileReq = makeRequest('http://localhost:3000/api/auth/profile', 'GET');
    const profileRes = await getProfileRoute(profileReq);
    assert.strictEqual(profileRes.status, 200, 'GET /api/auth/profile must return 200');

    const data = (await profileRes.json()) as {
      user: {
        id: string;
        email: string;
        name: string;
        _count?: { books: number; bookmarks: number };
      };
    };
    assert.ok(data.user);
    assert.strictEqual(data.user.id, testUserId);
    assert.strictEqual(data.user.email, testEmail);
    assert.strictEqual(data.user._count?.books, 0);
  });

  it('permanently deletes user account and leaves zero database residue via DELETE /api/auth/profile', async () => {
    const deleteProfileReq = makeRequest('http://localhost:3000/api/auth/profile', 'DELETE');
    const deleteProfileRes = await deleteProfileRoute(deleteProfileReq);
    assert.strictEqual(deleteProfileRes.status, 200, 'DELETE /api/auth/profile must return 200');

    // Confirm user is deleted
    const userInDb = await prisma.user.findUnique({ where: { id: testUserId } });
    assert.strictEqual(userInDb, null, 'User record must be completely deleted from PostgreSQL');

    // Confirm zero sessions remain
    const sessions = await prisma.session.findMany({ where: { userId: testUserId } });
    assert.strictEqual(sessions.length, 0, 'Zero session residue must remain');

    // Confirm zero books remain
    const books = await prisma.book.findMany({ where: { userId: testUserId } });
    assert.strictEqual(books.length, 0, 'Zero book residue must remain');
  });
});
