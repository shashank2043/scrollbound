import { Block } from './types';

export interface ChapterSuggestion {
  id: string;
  title: string;
  startBlockIndex: number;
  endBlockIndex: number; // exclusive
  previewSnippet: string;
}

export interface ChapterDetectionOptions {
  keyword?: string;
  minBlocksPerChapter?: number;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Standard regex for recognizing novel chapter headings:
 * Matches "Chapter 1", "Chapter 1408: Title", "CH. 2", "Prologue", "Epilogue", "Volume 1", "Part 2", etc.
 */
const DEFAULT_CHAPTER_REGEX =
  /^\s*(?:chapter|ch\.?|epilogue|prologue|act|volume|part|section)\b(?:\s*[:.\-–—]?\s*(?:\d+|[ivxcdlm]+|\b))?(?:\s*[:.\-–—]\s*.*|\s+.*)?$/i;

/**
 * Clean up heading text to form a crisp chapter title.
 */
function formatChapterTitle(rawText: string, fallbackIndex: number): string {
  const trimmed = rawText.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return `Chapter ${fallbackIndex + 1}`;
  }
  // Truncate overly long text if it somehow matched
  if (trimmed.length > 80) {
    return trimmed.slice(0, 77) + '...';
  }
  return trimmed;
}

/**
 * Automatically inspects extracted blocks and detects chapter boundary suggestions.
 * Suggestions are NOT final and can be freely adjusted by the user.
 */
export function detectChapters(
  blocks: Block[],
  options: ChapterDetectionOptions = {}
): ChapterSuggestion[] {
  if (!blocks || blocks.length === 0) return [];

  const { keyword, minBlocksPerChapter = 1 } = options;
  const userKeyword = keyword?.trim();

  // Build custom regex if keyword is supplied
  let customRegex: RegExp | null = null;
  if (userKeyword) {
    // If user provided a specific chapter string like "Chapter 1408", extract base prefix like "Chapter"
    const prefixMatch = userKeyword.match(/^([a-zA-Z]+)/);
    const escaped = escapeRegExp(userKeyword);
    if (prefixMatch && prefixMatch[1].length >= 2) {
      const escapedPrefix = escapeRegExp(prefixMatch[1]);
      customRegex = new RegExp(
        `^\\s*(?:${escaped}|${escapedPrefix}\\s*\\d+|${escapedPrefix}\\b)`,
        'i'
      );
    } else {
      customRegex = new RegExp(`^\\s*${escaped}\\b`, 'i');
    }
  }

  const detectedStarts: { blockIndex: number; title: string }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = block.text.trim();
    if (!text) continue;

    // Headings are prime candidates; paragraphs under 120 chars can also be chapter titles
    const isCandidateLength = block.type === 'heading' || text.length <= 120;
    if (!isCandidateLength) continue;

    let matched = false;
    if (customRegex && customRegex.test(text)) {
      matched = true;
    } else if (!customRegex && DEFAULT_CHAPTER_REGEX.test(text)) {
      matched = true;
    }

    if (matched) {
      // Ensure distance from previous detected breakpoint if minBlocksPerChapter > 1
      const lastIndex =
        detectedStarts.length > 0
          ? detectedStarts[detectedStarts.length - 1].blockIndex
          : -Infinity;

      if (i - lastIndex >= minBlocksPerChapter) {
        detectedStarts.push({
          blockIndex: i,
          title: formatChapterTitle(text, detectedStarts.length),
        });
      }
    }
  }

  // If no chapters detected, return single suggestion containing all blocks
  if (detectedStarts.length === 0) {
    return [
      {
        id: 'chap_1',
        title: 'Full Novel',
        startBlockIndex: 0,
        endBlockIndex: blocks.length,
        previewSnippet: blocks[0]?.text.slice(0, 100) || '',
      },
    ];
  }

  // If first detected chapter doesn't start at block 0, add a Prologue/Introduction
  const suggestions: ChapterSuggestion[] = [];
  if (detectedStarts[0].blockIndex > 0) {
    suggestions.push({
      id: 'chap_0',
      title: 'Prologue / Opening',
      startBlockIndex: 0,
      endBlockIndex: detectedStarts[0].blockIndex,
      previewSnippet: blocks[0]?.text.slice(0, 100) || '',
    });
  }

  // Construct suggestions with endBlockIndex
  for (let idx = 0; idx < detectedStarts.length; idx++) {
    const item = detectedStarts[idx];
    const nextStart =
      idx + 1 < detectedStarts.length
        ? detectedStarts[idx + 1].blockIndex
        : blocks.length;

    suggestions.push({
      id: `chap_${idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: item.title,
      startBlockIndex: item.blockIndex,
      endBlockIndex: nextStart,
      previewSnippet: blocks[item.blockIndex]?.text.slice(0, 100) || '',
    });
  }

  return recalculateBoundaries(suggestions, blocks.length);
}

/**
 * Re-validates and recalculates chapter endBlockIndex boundaries in ascending order.
 */
export function recalculateBoundaries(
  suggestions: ChapterSuggestion[],
  totalBlocks: number
): ChapterSuggestion[] {
  if (suggestions.length === 0) return [];

  // Sort by startBlockIndex
  const sorted = [...suggestions].sort(
    (a, b) => a.startBlockIndex - b.startBlockIndex
  );

  // Force first chapter to start at 0
  sorted[0].startBlockIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const nextStart =
      i + 1 < sorted.length ? sorted[i + 1].startBlockIndex : totalBlocks;

    current.endBlockIndex = Math.max(current.startBlockIndex + 1, nextStart);
  }

  // Last chapter must end at totalBlocks
  sorted[sorted.length - 1].endBlockIndex = totalBlocks;

  return sorted;
}

/**
 * Slices blocks array into chapter chunks based on user-approved suggestions.
 */
export function sliceBlocksForChapters(
  blocks: Block[],
  suggestions: ChapterSuggestion[]
): { chapter: ChapterSuggestion; blocks: Block[] }[] {
  const normalized = recalculateBoundaries(suggestions, blocks.length);

  return normalized.map((chap) => {
    const chapterBlocks = blocks
      .slice(chap.startBlockIndex, chap.endBlockIndex)
      .map((b, relativeIdx) => ({
        ...b,
        id: relativeIdx, // Normalize IDs within the chapter starting from 0
      }));

    return {
      chapter: chap,
      blocks: chapterBlocks,
    };
  });
}
