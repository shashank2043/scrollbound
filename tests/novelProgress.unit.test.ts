import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateNovelProgress } from '../src/lib/db';
import { Book, Progress } from '../src/lib/types';

describe('Novel Progress & Chapter Navigation Math', () => {
  const parentNovel: Book = {
    id: 'novel_100',
    title: 'The Great Chronicle',
    createdAt: 1000,
    updatedAt: 1000,
    blockCount: 300,
    chunkCount: 0,
    totalChapters: 3,
  };

  const chapter1: Book = {
    id: 'chap_100_1',
    parentId: 'novel_100',
    chapterIndex: 0,
    chapterTitle: 'Chapter 1: The Beginning',
    title: 'The Great Chronicle - Chapter 1',
    createdAt: 1000,
    updatedAt: 1000,
    blockCount: 100,
    chunkCount: 2,
    totalChapters: 3,
    prevBookId: null,
    nextBookId: 'chap_100_2',
  };

  const chapter2: Book = {
    id: 'chap_100_2',
    parentId: 'novel_100',
    chapterIndex: 1,
    chapterTitle: 'Chapter 2: The Journey',
    title: 'The Great Chronicle - Chapter 2',
    createdAt: 1000,
    updatedAt: 1000,
    blockCount: 100,
    chunkCount: 2,
    totalChapters: 3,
    prevBookId: 'chap_100_1',
    nextBookId: 'chap_100_3',
  };

  const chapter3: Book = {
    id: 'chap_100_3',
    parentId: 'novel_100',
    chapterIndex: 2,
    chapterTitle: 'Chapter 3: The Climax',
    title: 'The Great Chronicle - Chapter 3',
    createdAt: 1000,
    updatedAt: 1000,
    blockCount: 100,
    chunkCount: 2,
    totalChapters: 3,
    prevBookId: 'chap_100_2',
    nextBookId: null,
  };

  const allBooks = [parentNovel, chapter1, chapter2, chapter3];

  it('correctly reports 0% for an unread chaptered novel', () => {
    const progressMap: Record<string, Progress> = {};
    const result = calculateNovelProgress(parentNovel, allBooks, progressMap);

    assert.strictEqual(result.currentChapter?.id, 'chap_100_1');
    assert.strictEqual(result.currentChapterIndex, 0);
    assert.strictEqual(result.chapterPercent, 0);
    assert.strictEqual(result.overallPercent, 0);
    assert.strictEqual(result.totalChapters, 3);
  });

  it('calculates progress when user is halfway through Chapter 1', () => {
    const progressMap: Record<string, Progress> = {
      chap_100_1: {
        bookId: 'chap_100_1',
        blockId: 50,
        offset: 0,
        percent: 50,
        updatedAt: 2000,
      },
    };

    const result = calculateNovelProgress(parentNovel, allBooks, progressMap);
    assert.strictEqual(result.currentChapter?.id, 'chap_100_1');
    assert.strictEqual(result.chapterPercent, 50);
    // 50 blocks out of 300 total blocks = 17%
    assert.strictEqual(result.overallPercent, 17);
  });

  it('calculates composite progress across completed previous chapters and active chapter', () => {
    const progressMap: Record<string, Progress> = {
      chap_100_1: {
        bookId: 'chap_100_1',
        blockId: 99,
        offset: 0,
        percent: 100,
        updatedAt: 2000,
      },
      chap_100_2: {
        bookId: 'chap_100_2',
        blockId: 50,
        offset: 0,
        percent: 50,
        updatedAt: 3000, // Read later than chapter 1
      },
    };

    const result = calculateNovelProgress(parentNovel, allBooks, progressMap);
    assert.strictEqual(result.currentChapter?.id, 'chap_100_2');
    assert.strictEqual(result.currentChapterIndex, 1);
    assert.strictEqual(result.chapterPercent, 50);
    // 100 blocks from chap 1 + 50 blocks in chap 2 = 150/300 = 50%
    assert.strictEqual(result.overallPercent, 50);
  });

  it('verifies next and previous linking pointers across chapter chain', () => {
    assert.strictEqual(chapter1.prevBookId, null);
    assert.strictEqual(chapter1.nextBookId, chapter2.id);

    assert.strictEqual(chapter2.prevBookId, chapter1.id);
    assert.strictEqual(chapter2.nextBookId, chapter3.id);

    assert.strictEqual(chapter3.prevBookId, chapter2.id);
    assert.strictEqual(chapter3.nextBookId, null);
  });

  it('correctly maps existing novel reading progress to the corresponding chapter when split', () => {
    // If a user previously read block 150 of an uploaded continuous book
    const previousGlobalBlock = 150;
    const chapters = [chapter1, chapter2, chapter3];

    let accumulated = 0;
    let targetChapter = chapters[0];
    let relativeBlock = previousGlobalBlock;

    for (const ch of chapters) {
      if (previousGlobalBlock >= accumulated && previousGlobalBlock < accumulated + ch.blockCount) {
        targetChapter = ch;
        relativeBlock = previousGlobalBlock - accumulated;
        break;
      }
      accumulated += ch.blockCount;
    }

    assert.strictEqual(targetChapter.id, 'chap_100_2');
    assert.strictEqual(relativeBlock, 50); // Block 150 is block 50 in chapter 2
  });
});
