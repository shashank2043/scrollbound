import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../src/lib/prisma';
import { Prisma } from '@prisma/client';
import { createChunksFromBlocks } from '../src/lib/db';
import { detectChapters, sliceBlocksForChapters } from '../src/lib/chapterDetector';
import { Block } from '../src/lib/types';

describe('End-to-End Real Database Read/Write & Chapter Splitting Test', () => {
  let testUserId: string;
  const testEmail = `test_e2e_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@scrollbound.test`;
  const parentBookId = `book_e2e_${Date.now()}`;

  // 1. Account Creation (Setup)
  before(async () => {
    const user = await prisma.user.create({
      data: {
        name: 'E2E Full Lifecycle Tester',
        email: testEmail,
      },
    });
    testUserId = user.id;
    console.log(`[E2E Test] Created test user: ${testUserId} (${testEmail})`);
  });

  // 6. Complete Clean-up (Zero Residue)
  after(async () => {
    if (testUserId) {
      // Cascade delete deletes all books, chunks, progresses, bookmarks
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
      console.log(`[E2E Test] Cleaned up test user: ${testUserId} (Zero residue left)`);

      // Verify zero residue
      const remainingUser = await prisma.user.findUnique({ where: { id: testUserId } });
      const remainingBooks = await prisma.book.findMany({ where: { userId: testUserId } });
      assert.strictEqual(remainingUser, null, 'User must be deleted');
      assert.strictEqual(remainingBooks.length, 0, 'No books must remain');
    }
  });

  it('creates an uploaded novel with multiple chunks in the database', async () => {
    // Generate 600 blocks simulating an uploaded novel like Overgeared
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

    // Save Book in database
    const createdBook = await prisma.book.create({
      data: {
        id: parentBookId,
        userId: testUserId,
        title: 'Overgeared E2E Test Novel',
        blockCount: dummyBlocks.length,
        chunkCount: chunks.length,
      },
    });

    assert.strictEqual(createdBook.id, parentBookId);
    assert.strictEqual(createdBook.blockCount, 600);

    // Save Chunks in database
    await prisma.chunk.createMany({
      data: chunks.map((c) => ({
        id: c.id,
        bookId: parentBookId,
        index: c.index,
        blocks: c.blocks as unknown as Prisma.InputJsonValue,
      })),
    });

    const savedChunks = await prisma.chunk.findMany({
      where: { bookId: parentBookId },
      orderBy: { index: 'asc' },
    });

    assert.strictEqual(savedChunks.length, chunks.length);
  });

  it('records reading progress at block 150 for the user on the uploaded novel', async () => {
    const prog = await prisma.progress.upsert({
      where: {
        userId_bookId: {
          userId: testUserId,
          bookId: parentBookId,
        },
      },
      update: {
        blockId: 150,
        offset: 0.2,
        percent: 25,
      },
      create: {
        userId: testUserId,
        bookId: parentBookId,
        blockId: 150,
        offset: 0.2,
        percent: 25,
      },
    });

    assert.strictEqual(prog.blockId, 150);
  });

  it('splits the existing novel into 10 linked chapters with high volume chunks without transaction timeout', async () => {
    // 1. Fetch chunks and reconstruct blocks
    const savedChunks = await prisma.chunk.findMany({
      where: { bookId: parentBookId },
      orderBy: { index: 'asc' },
    });

    const allBlocks: Block[] = [];
    for (const c of savedChunks) {
      allBlocks.push(...(c.blocks as unknown as Block[]));
    }
    assert.strictEqual(allBlocks.length, 600);

    // 2. Detect chapters
    const suggestions = detectChapters(allBlocks);
    assert.strictEqual(suggestions.length, 10);

    // 3. Slice into 10 chapters
    const sliced = sliceBlocksForChapters(allBlocks, suggestions);
    const chapterIds = suggestions.map(
      (_, idx) => `chap_${parentBookId}_${idx + 1}`
    );

    const chapterPayloads = sliced.map((s, idx) => {
      const chId = chapterIds[idx];
      const chunks = createChunksFromBlocks(chId, s.blocks);
      return {
        id: chId,
        title: `Overgeared E2E - ${s.chapter.title}`,
        chapterIndex: idx,
        chapterTitle: s.chapter.title,
        prevBookId: idx > 0 ? chapterIds[idx - 1] : null,
        nextBookId: idx < sliced.length - 1 ? chapterIds[idx + 1] : null,
        blockCount: s.blocks.length,
        chunkCount: chunks.length,
        chunks,
      };
    });

    // 4. Execute the batch transaction with extended timeout (the exact logic in /api/books/[bookId]/split)
    const t0 = performance.now();
    await prisma.$transaction(
      async (tx) => {
        // Delete previously generated chapters
        await tx.book.deleteMany({
          where: { parentId: parentBookId, userId: testUserId },
        });

        // Update parent book's totalChapters
        await tx.book.update({
          where: { id: parentBookId },
          data: {
            totalChapters: chapterPayloads.length,
            updatedAt: new Date(),
          },
        });

        // Batch create chapter books
        const chapterBooksData = chapterPayloads.map((ch) => ({
          id: ch.id,
          userId: testUserId,
          title: ch.title,
          parentId: parentBookId,
          chapterIndex: ch.chapterIndex,
          chapterTitle: ch.chapterTitle,
          totalChapters: chapterPayloads.length,
          nextBookId: ch.nextBookId,
          prevBookId: ch.prevBookId,
          blockCount: ch.blockCount,
          chunkCount: ch.chunkCount,
        }));

        await tx.book.createMany({
          data: chapterBooksData,
        });

        // Batch create all chunks
        const allChunksData = chapterPayloads.flatMap((ch) =>
          ch.chunks.map((c) => ({
            id: c.id,
            bookId: ch.id,
            index: c.index,
            blocks: c.blocks as unknown as Prisma.InputJsonValue,
          }))
        );

        await tx.chunk.createMany({
          data: allChunksData,
        });

        // Migrate reading progress (block 150)
        const parentProgress = await tx.progress.findUnique({
          where: {
            userId_bookId: {
              userId: testUserId,
              bookId: parentBookId,
            },
          },
        });

        if (parentProgress) {
          let accumulatedBlocks = 0;
          let matchedChapter = chapterBooksData[0];
          let relativeBlockId = parentProgress.blockId;

          for (const ch of chapterBooksData) {
            if (
              parentProgress.blockId >= accumulatedBlocks &&
              parentProgress.blockId < accumulatedBlocks + ch.blockCount
            ) {
              matchedChapter = ch;
              relativeBlockId = parentProgress.blockId - accumulatedBlocks;
              break;
            }
            accumulatedBlocks += ch.blockCount;
          }

          await tx.progress.upsert({
            where: {
              userId_bookId: {
                userId: testUserId,
                bookId: matchedChapter.id,
              },
            },
            update: {
              blockId: relativeBlockId,
              offset: parentProgress.offset,
              percent: Math.round((relativeBlockId / matchedChapter.blockCount) * 100),
              updatedAt: new Date(),
            },
            create: {
              userId: testUserId,
              bookId: matchedChapter.id,
              blockId: relativeBlockId,
              offset: parentProgress.offset,
              percent: Math.round((relativeBlockId / matchedChapter.blockCount) * 100),
            },
          });
        }
      },
      {
        maxWait: 15000,
        timeout: 30000,
      }
    );

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[E2E Test] Splitting 10 chapters + chunks succeeded in ${elapsed}ms`);

    // Verify 10 chapters created
    const createdChapters = await prisma.book.findMany({
      where: { parentId: parentBookId, userId: testUserId },
      orderBy: { chapterIndex: 'asc' },
    });
    assert.strictEqual(createdChapters.length, 10);
    assert.strictEqual(createdChapters[0].chapterTitle, 'Chapter 1411');
    assert.strictEqual(createdChapters[9].chapterTitle, 'Chapter 1420');

    // Verify Chapter 1 points to Chapter 2
    assert.strictEqual(createdChapters[0].nextBookId, createdChapters[1].id);
    assert.strictEqual(createdChapters[0].prevBookId, null);

    // Verify migrated reading progress:
    // Block 150 falls in Chapter 3 (index 2: blocks 120 -> 179), so relativeBlockId is 150 - 120 = 30
    const migratedProgress = await prisma.progress.findUnique({
      where: {
        userId_bookId: {
          userId: testUserId,
          bookId: createdChapters[2].id,
        },
      },
    });
    assert.ok(migratedProgress, 'Reading progress must be migrated to Chapter 3');
    assert.strictEqual(migratedProgress!.blockId, 30);
  });

  it('cascades deletion of parent book and purges all child chapters and chunks', async () => {
    // Delete parent book
    await prisma.book.delete({
      where: { id: parentBookId },
    });

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
});
