import { Block, BlockType } from '../types';

export interface RawTextItem {
  str: string;
  x: number;
  y: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  page: number;
  pageWidth: number;
  pageHeight: number;
}

export interface ExtractedLine {
  text: string;
  x: number;
  top: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  page: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Group raw text items on each page into visual lines sorted top-to-bottom, left-to-right.
 */
export function groupItemsIntoLines(items: RawTextItem[]): ExtractedLine[] {
  if (items.length === 0) return [];

  // Group by page first
  const pageMap = new Map<number, RawTextItem[]>();
  for (const item of items) {
    let pList = pageMap.get(item.page);
    if (!pList) {
      pList = [];
      pageMap.set(item.page, pList);
    }
    pList.push(item);
  }

  const allLines: ExtractedLine[] = [];

  const pages = Array.from(pageMap.keys()).sort((a, b) => a - b);
  for (const pageNum of pages) {
    const pageItems = pageMap.get(pageNum)!;
    // Sort items by top ascending (top to bottom), then x ascending (left to right)
    pageItems.sort((a, b) => {
      const topDiff = a.top - b.top;
      if (Math.abs(topDiff) > 3) {
        return topDiff;
      }
      return a.x - b.x;
    });

    const lines: ExtractedLine[] = [];
    let currentLineItems: RawTextItem[] = [];

    const flushLine = () => {
      if (currentLineItems.length === 0) return;
      currentLineItems.sort((a, b) => a.x - b.x);

      let lineText = '';
      const minX = currentLineItems[0].x;
      const minTop = currentLineItems[0].top;
      const rawY = currentLineItems[0].y;
      let maxFontSize = 0;
      let maxHeight = 0;
      let totalWidth = 0;

      for (let i = 0; i < currentLineItems.length; i++) {
        const item = currentLineItems[i];
        if (item.fontSize > maxFontSize) maxFontSize = item.fontSize;
        if (item.height > maxHeight) maxHeight = item.height;

        if (i === 0) {
          lineText = item.str;
        } else {
          const prev = currentLineItems[i - 1];
          const gap = item.x - (prev.x + prev.width);
          // If there's a horizontal gap and no whitespace between
          if (gap > 2 && !prev.str.endsWith(' ') && !item.str.startsWith(' ')) {
            lineText += ' ' + item.str;
          } else {
            lineText += item.str;
          }
        }
      }

      const last = currentLineItems[currentLineItems.length - 1];
      totalWidth = last.x + last.width - minX;

      const trimmedText = lineText.replace(/\s+/g, ' ').trim();
      if (trimmedText.length > 0) {
        lines.push({
          text: trimmedText,
          x: minX,
          top: minTop,
          y: rawY,
          width: totalWidth,
          height: maxHeight,
          fontSize: maxFontSize || 12,
          page: pageNum,
          pageWidth: currentLineItems[0].pageWidth,
          pageHeight: currentLineItems[0].pageHeight,
        });
      }

      currentLineItems = [];
    };

    for (const item of pageItems) {
      if (!item.str || item.str.trim() === '') continue;

      if (currentLineItems.length === 0) {
        currentLineItems.push(item);
      } else {
        const first = currentLineItems[0];
        // If within vertical tolerance (~3.5 pt)
        if (Math.abs(item.top - first.top) <= 3.5) {
          currentLineItems.push(item);
        } else {
          flushLine();
          currentLineItems.push(item);
        }
      }
    }
    flushLine();

    allLines.push(...lines);
  }

  return allLines;
}

/**
 * Detect repeated running headers, footers, and standalone page numbers across pages.
 */
export function filterHeadersAndFooters(lines: ExtractedLine[], totalPages: number): ExtractedLine[] {
  if (lines.length === 0) return [];

  // 1. Identify page numbers
  const isPageNumberText = (str: string): boolean => {
    const s = str.trim().toLowerCase();
    // digits only, Roman numerals, or - 12 -
    if (/^\d{1,5}$/.test(s)) return true;
    if (/^-\s*\d{1,5}\s*-$/.test(s)) return true;
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(s)) return true;
    if (/^[ivxlcdm]{1,8}$/i.test(s)) return true;
    if (/^\d{1,5}\s*[\/\|]\s*\d{1,5}$/.test(s)) return true;
    return false;
  };

  // 2. Collect header & footer candidate lines (top 12% and bottom 12% of each page)
  const headerLinesByPage = new Map<number, ExtractedLine[]>();
  const footerLinesByPage = new Map<number, ExtractedLine[]>();

  for (const line of lines) {
    const isTop = line.top <= line.pageHeight * 0.12;
    const isBottom = line.top >= line.pageHeight * 0.88;

    if (isTop) {
      const list = headerLinesByPage.get(line.page) || [];
      list.push(line);
      headerLinesByPage.set(line.page, list);
    } else if (isBottom) {
      const list = footerLinesByPage.get(line.page) || [];
      list.push(line);
      footerLinesByPage.set(line.page, list);
    }
  }

  // Count recurrence of header / footer normalized strings
  const headerFrequency = new Map<string, number>();
  const footerFrequency = new Map<string, number>();

  const normalizeForMatch = (s: string) =>
    s.toLowerCase().replace(/[\d\s\-_.,—–:;]/g, '');

  headerLinesByPage.forEach((pageLines) => {
    const seen = new Set<string>();
    for (const l of pageLines) {
      const norm = normalizeForMatch(l.text);
      if (norm.length > 2 && !seen.has(norm)) {
        seen.add(norm);
        headerFrequency.set(norm, (headerFrequency.get(norm) || 0) + 1);
      }
    }
  });

  footerLinesByPage.forEach((pageLines) => {
    const seen = new Set<string>();
    for (const l of pageLines) {
      const norm = normalizeForMatch(l.text);
      if (norm.length > 2 && !seen.has(norm)) {
        seen.add(norm);
        footerFrequency.set(norm, (footerFrequency.get(norm) || 0) + 1);
      }
    }
  });

  // Threshold: if a line appears in header/footer on >= 3 pages or >= 25% of pages (when totalPages > 2)
  const isRepeatingHeader = (norm: string): boolean => {
    if (!norm || norm.length <= 2) return false;
    const count = headerFrequency.get(norm) || 0;
    if (totalPages <= 2) return false;
    return count >= 3 || count / totalPages >= 0.25;
  };

  const isRepeatingFooter = (norm: string): boolean => {
    if (!norm || norm.length <= 2) return false;
    const count = footerFrequency.get(norm) || 0;
    if (totalPages <= 2) return false;
    return count >= 3 || count / totalPages >= 0.25;
  };

  return lines.filter((line) => {
    const isTop = line.top <= line.pageHeight * 0.12;
    const isBottom = line.top >= line.pageHeight * 0.88;

    // Discard lone page numbers at top or bottom
    if ((isTop || isBottom) && isPageNumberText(line.text)) {
      return false;
    }

    // Discard repeating headers
    if (isTop) {
      const norm = normalizeForMatch(line.text);
      if (isRepeatingHeader(norm)) {
        return false;
      }
    }

    // Discard repeating footers
    if (isBottom) {
      const norm = normalizeForMatch(line.text);
      if (isRepeatingFooter(norm)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if a text is likely a chapter heading or section title.
 */
export function isHeadingLine(line: ExtractedLine, medianFontSize: number, medianWidth: number): boolean {
  const text = line.text.trim();
  if (!text || text.length > 90) return false;

  // Pattern matches (e.g. "Chapter 1", "CHAPTER IV", "Prologue", "Book 2: The Return", "Part One")
  const headingPattern = /^(chapter|prologue|epilogue|part|book|act|scene)\b/i;
  if (headingPattern.test(text)) {
    return true;
  }

  // Roman numeral chapter or "Chapter N: Title"
  if (/^chapter\s+([0-9ivxlcdm]+|[a-z]+)/i.test(text)) {
    return true;
  }

  // Standalone all-caps line of reasonable length (e.g., "THE GATHERING STORM")
  const words = text.split(/\s+/).filter(Boolean);
  const isAllCaps = text === text.toUpperCase() && /[A-Z]/.test(text) && !/[.,;]$/.test(text);
  if (isAllCaps && words.length <= 8 && text.length >= 3 && text.length <= 50) {
    return true;
  }

  // Significantly larger font size than body text and short line
  if (line.fontSize >= medianFontSize * 1.25 && line.width <= medianWidth * 0.8 && !/[.,;]$/.test(text)) {
    return true;
  }

  return false;
}

/**
 * Fix hyphenated line breaks between two strings.
 * e.g., "infor-" + "mation" -> "information"
 * e.g., "well-" + "known" -> "well-known"
 */
export function joinWithHyphenHandling(prev: string, next: string): string {
  // Check if prev ends with a hyphen attached to a word
  const hyphenMatch = prev.match(/(\b[a-zA-Z]+)-$/);
  if (hyphenMatch) {
    const prefix = hyphenMatch[1];
    const nextMatch = next.match(/^([a-zA-Z]+)(\b[\s\S]*)/);
    if (nextMatch) {
      const nextWord = nextMatch[1];
      const remainder = nextMatch[2] || '';
      const basePrev = prev.slice(0, prev.length - hyphenMatch[0].length);

      // If the continuation word starts with a lowercase letter, it's almost always a wrapped word
      if (/^[a-z]/.test(nextWord)) {
        return basePrev + prefix + nextWord + remainder;
      }

      // If prefix is something like "well-", "self-", keep the hyphen
      return basePrev + prefix + '-' + nextWord + remainder;
    }
  }

  return prev + ' ' + next;
}

/**
 * Reflow cleaned lines into structured blocks (paragraphs and headings).
 */
export function reflowLinesToBlocks(
  lines: ExtractedLine[],
  startBlockId = 0
): Block[] {
  if (lines.length === 0) return [];

  // Calculate median font size and line height / gaps
  const fontSizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

  const widths = lines.map((l) => l.width).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)] || 400;

  // Calculate typical vertical gaps between consecutive lines on the same page
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) {
      const gap = lines[i].top - lines[i - 1].top;
      if (gap > 0 && gap < 50) {
        gaps.push(gap);
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 14;

  // Determine standard left margin (10th percentile of x)
  const xValues = lines.map((l) => l.x).sort((a, b) => a - b);
  const standardMarginLeft = xValues[Math.floor(xValues.length * 0.1)] || 50;

  const blocks: Block[] = [];
  let currentBlockType: BlockType = 'paragraph';
  let currentBlockText = '';
  let blockIdCounter = startBlockId;

  const flushBlock = () => {
    const trimmed = currentBlockText.replace(/\s+/g, ' ').trim();
    if (trimmed.length > 0) {
      blocks.push({
        id: blockIdCounter++,
        type: currentBlockType,
        text: trimmed,
      });
    }
    currentBlockText = '';
    currentBlockType = 'paragraph';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : null;

    // Check if this line is a heading
    const isHeading = isHeadingLine(line, medianFontSize, medianWidth);

    if (isHeading) {
      // Flush previous paragraph
      flushBlock();
      currentBlockType = 'heading';
      currentBlockText = line.text;
      flushBlock();
      continue;
    }

    // Determine if line starts a new paragraph:
    let isNewParagraph = false;

    if (!prevLine) {
      isNewParagraph = true;
    } else {
      // 1. If previous line was a heading, new paragraph
      if (blocks.length > 0 && blocks[blocks.length - 1].type === 'heading' && currentBlockText === '') {
        isNewParagraph = true;
      }
      // 2. Significant vertical gap (> 1.45 * median gap) on the same page
      else if (line.page === prevLine.page && line.top - prevLine.top > medianGap * 1.45) {
        isNewParagraph = true;
      }
      // 3. Page break and either paragraph indentation or previous line ended short
      else if (line.page !== prevLine.page) {
        const isIndented = line.x >= standardMarginLeft + 12;
        const prevEndedShort = prevLine.width < medianWidth * 0.75 && !prevLine.text.endsWith('-');
        if (isIndented || prevEndedShort) {
          isNewParagraph = true;
        }
      }
      // 4. Line is indented (> standard margin + 12pt)
      else if (line.x >= standardMarginLeft + 12) {
        isNewParagraph = true;
      }
      // 5. Previous line ended short (< 70% median width) and didn't end with a hyphen
      else if (prevLine.width < medianWidth * 0.7 && !prevLine.text.endsWith('-')) {
        isNewParagraph = true;
      }
    }

    if (isNewParagraph && currentBlockText.length > 0) {
      flushBlock();
    }

    if (currentBlockText.length === 0) {
      currentBlockText = line.text;
    } else {
      currentBlockText = joinWithHyphenHandling(currentBlockText, line.text);
    }
  }

  flushBlock();
  return blocks;
}
