export type BlockType = 'paragraph' | 'heading';

export interface Block {
  id: number;
  type: BlockType;
  text: string;
}

export interface Book {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  blockCount: number;
  chunkCount: number;
  lastReadAt?: number;
}

export interface Chunk {
  id: string; // `${bookId}:${index}`
  bookId: string;
  index: number;
  blocks: Block[];
}

export interface Progress {
  bookId: string;
  blockId: number;
  offset: number; // 0-1 fraction
  percent: number; // 0-100
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  blockId: number;
  snippet: string;
  note?: string;
  createdAt: number;
}

export interface CustomTheme {
  id: string;
  name: string;
  bg: string;
  text: string;
  accent: string;
}

export type FontFamily = 'serif' | 'sans' | 'poppins' | 'mono' | 'dyslexic';

export interface ReaderSettings {
  fontSize: number; // e.g. 14 to 32px
  fontFamily: FontFamily;
  lineHeight: number; // e.g. 1.4 to 2.2
  contentWidth: number; // e.g. 55 to 80 (ch)
  themeId: string; // 'light' | 'dark' | 'sepia' or custom theme ID
  autoSyncEnabled?: boolean; // Turn on/off auto sync
  autoSyncIntervalMinutes?: number; // e.g. 1, 2, 5, 10, 15, 30 (default 5)
}

export interface ExportData {
  version: 1;
  exportedAt: number;
  books: Book[];
  chunks: Chunk[];
  progress: Progress[];
  bookmarks: Bookmark[];
  themes: CustomTheme[];
  settings?: ReaderSettings;
}
