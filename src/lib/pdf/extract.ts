import { Block } from '../types';
import {
  RawTextItem,
  groupItemsIntoLines,
  filterHeadersAndFooters,
  reflowLinesToBlocks,
} from './cleanup';

export interface ExtractProgress {
  current: number;
  total: number;
  stage: 'loading' | 'extracting' | 'reflowing';
}

/**
 * Configure PDF.js worker in browser environment
 */
let workerConfigured = false;
async function getPdfJs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF extraction is only supported in browser environments.');
  }

  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerConfigured = true;
  }
  return pdfjsLib;
}

/**
 * Extract text blocks from a PDF File or ArrayBuffer.
 * Processes page by page and yields to main thread to prevent UI freezing on 1000+ page books.
 */
export async function extractPdfBlocks(
  data: ArrayBuffer | Uint8Array,
  options?: {
    startBlockId?: number;
    onProgress?: (progress: ExtractProgress) => void;
  }
): Promise<{ blocks: Block[]; totalPages: number }> {
  const { startBlockId = 0, onProgress } = options || {};

  onProgress?.({ current: 0, total: 100, stage: 'loading' });

  const pdfjsLib = await getPdfJs();
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;

  if (totalPages === 0) {
    throw new Error('The selected PDF file contains no pages.');
  }

  const allRawItems: RawTextItem[] = [];
  let totalRawChars = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      current: pageNum,
      total: totalPages,
      stage: 'extracting',
    });

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if ('str' in item) {
        const str = item.str;
        if (!str || str.trim() === '') continue;

        totalRawChars += str.trim().length;

        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
        const x = transform[4];
        const y = transform[5];
        const top = viewport.height - y;
        const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]) || item.height || 12;

        allRawItems.push({
          str,
          x,
          y,
          top,
          width: item.width || 0,
          height: item.height || fontSize,
          fontSize,
          page: pageNum,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        });
      }
    }

    // Yield to main thread every page (or every 2 pages) so UI stays completely responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Check if PDF has extractable text
  if (totalRawChars < 30) {
    throw new Error(
      'No extractable text was found in this PDF. It appears to be a scanned document or image-only file, which requires OCR.'
    );
  }

  onProgress?.({
    current: totalPages,
    total: totalPages,
    stage: 'reflowing',
  });

  // 1. Group items into physical lines
  const lines = groupItemsIntoLines(allRawItems);

  // 2. Filter out repeating headers, running footers, and page numbers
  const cleanedLines = filterHeadersAndFooters(lines, totalPages);

  // 3. Reflow lines into clean paragraphs and detected headings
  const blocks = reflowLinesToBlocks(cleanedLines, startBlockId);

  if (blocks.length === 0) {
    throw new Error(
      'No text paragraphs could be extracted from this PDF. Please check the document format.'
    );
  }

  return { blocks, totalPages };
}
