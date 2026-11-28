import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectChapters,
  recalculateBoundaries,
  sliceBlocksForChapters,
  ChapterSuggestion,
} from '../src/lib/chapterDetector';
import { Block } from '../src/lib/types';

describe('Chapter Detection Engine', () => {
  const sampleBlocks: Block[] = [
    { id: 0, type: 'paragraph', text: 'Introduction text before any chapter starts.' },
    { id: 1, type: 'paragraph', text: 'More background context.' },
    { id: 2, type: 'heading', text: 'Chapter 1: The Awakening' },
    { id: 3, type: 'paragraph', text: 'It was a cold winter night when the stars fell.' },
    { id: 4, type: 'paragraph', text: 'He looked at the sky and wondered.' },
    { id: 5, type: 'heading', text: 'Chapter 2: The Crimson Seal' },
    { id: 6, type: 'paragraph', text: 'The second day began with tension in the air.' },
    { id: 7, type: 'heading', text: 'Chapter 1408: The Far Realm' },
    { id: 8, type: 'paragraph', text: 'Thousands of cycles had passed.' },
    { id: 9, type: 'heading', text: 'Epilogue' },
    { id: 10, type: 'paragraph', text: 'And thus the world was restored.' },
  ];

  it('detects standard chapters with automatic prologue when block 0 is not a chapter', () => {
    const suggestions = detectChapters(sampleBlocks);

    assert.strictEqual(suggestions.length, 5); // Prologue + Chapter 1 + Chapter 2 + Chapter 1408 + Epilogue
    assert.strictEqual(suggestions[0].title, 'Prologue / Opening');
    assert.strictEqual(suggestions[0].startBlockIndex, 0);
    assert.strictEqual(suggestions[0].endBlockIndex, 2);

    assert.strictEqual(suggestions[1].title, 'Chapter 1: The Awakening');
    assert.strictEqual(suggestions[1].startBlockIndex, 2);
    assert.strictEqual(suggestions[1].endBlockIndex, 5);

    assert.strictEqual(suggestions[2].title, 'Chapter 2: The Crimson Seal');
    assert.strictEqual(suggestions[2].startBlockIndex, 5);
    assert.strictEqual(suggestions[2].endBlockIndex, 7);

    assert.strictEqual(suggestions[3].title, 'Chapter 1408: The Far Realm');
    assert.strictEqual(suggestions[3].startBlockIndex, 7);
    assert.strictEqual(suggestions[3].endBlockIndex, 9);

    assert.strictEqual(suggestions[4].title, 'Epilogue');
    assert.strictEqual(suggestions[4].startBlockIndex, 9);
    assert.strictEqual(suggestions[4].endBlockIndex, 11);
  });

  it('detects chapters using user-specified keyword pattern like "Chapter 1408"', () => {
    const suggestions = detectChapters(sampleBlocks, { keyword: 'Chapter 1408' });

    // With "Chapter 1408" specified, it matches "Chapter" pattern prefix or specific text
    assert.ok(suggestions.length >= 3);
    const hasFarRealm = suggestions.some((s) => s.title.includes('Chapter 1408'));
    assert.strictEqual(hasFarRealm, true);
  });

  it('allows user to manually adjust boundaries, delete a chapter, and add a chapter', () => {
    const suggestions = detectChapters(sampleBlocks);
    assert.strictEqual(suggestions.length, 5);

    // Simulate user deleting Chapter 2 (suggestions[2])
    const withoutChap2 = suggestions.filter((_, idx) => idx !== 2);

    // Recalculate
    const updated = recalculateBoundaries(withoutChap2, sampleBlocks.length);
    assert.strictEqual(updated.length, 4);
    assert.strictEqual(updated[0].startBlockIndex, 0);
    assert.strictEqual(updated[updated.length - 1].endBlockIndex, sampleBlocks.length);

    // Chapter 1 should now span from block 2 to block 7 (where Chapter 1408 starts)
    assert.strictEqual(updated[1].startBlockIndex, 2);
    assert.strictEqual(updated[1].endBlockIndex, 7);
  });

  it('correctly slices blocks for each chapter and resets relative block IDs', () => {
    const suggestions = detectChapters(sampleBlocks);
    const sliced = sliceBlocksForChapters(sampleBlocks, suggestions);

    assert.strictEqual(sliced.length, 5);
    // Chapter 1 (sliced[1]) has 3 blocks: id 2, 3, 4 from sampleBlocks
    assert.strictEqual(sliced[1].blocks.length, 3);
    assert.strictEqual(sliced[1].blocks[0].id, 0); // normalized to 0
    assert.strictEqual(sliced[1].blocks[0].text, 'Chapter 1: The Awakening');
    assert.strictEqual(sliced[1].blocks[1].id, 1);
    assert.strictEqual(sliced[1].blocks[2].id, 2);
  });

  it('handles novels with no chapter keywords gracefully as a single Full Novel suggestion', () => {
    const plainBlocks: Block[] = [
      { id: 0, type: 'paragraph', text: 'This is a continuous story without chapter markers.' },
      { id: 1, type: 'paragraph', text: 'It continues for pages and pages.' },
    ];

    const suggestions = detectChapters(plainBlocks);
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0].title, 'Full Novel');
    assert.strictEqual(suggestions[0].startBlockIndex, 0);
    assert.strictEqual(suggestions[0].endBlockIndex, 2);
  });

  it('supports visual breakpoint placement at specific content blocks and reorders boundaries', () => {
    // Start with 1 full novel suggestion
    const initial = detectChapters(sampleBlocks);
    
    // Simulate user reading content and placing a visual breakpoint at block 4
    const customBreak: ChapterSuggestion = {
      id: 'custom_cut_1',
      title: 'Chapter 1.5: Winter Stars',
      startBlockIndex: 4,
      endBlockIndex: sampleBlocks.length,
      previewSnippet: sampleBlocks[4].text.slice(0, 100),
    };

    const updated = recalculateBoundaries([...initial, customBreak], sampleBlocks.length);
    assert.strictEqual(updated.length, initial.length + 1);

    // Verify ordering: Chapter at block 2 now ends at block 4, and custom chapter starts at block 4 and ends at block 5
    const chapBefore = updated.find((s) => s.startBlockIndex === 2);
    const customChap = updated.find((s) => s.startBlockIndex === 4);
    const chapAfter = updated.find((s) => s.startBlockIndex === 5);

    assert.ok(chapBefore);
    assert.ok(customChap);
    assert.ok(chapAfter);

    assert.strictEqual(chapBefore!.endBlockIndex, 4);
    assert.strictEqual(customChap!.startBlockIndex, 4);
    assert.strictEqual(customChap!.endBlockIndex, 5);
    assert.strictEqual(chapAfter!.startBlockIndex, 5);
  });
});
