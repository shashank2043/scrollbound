export type BlockType = 'paragraph' | 'heading';

export interface Block {
  id: number;
  type: BlockType;
  text: string;
}

export interface Book {
  id: string;
  userId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  blockCount: number;
  chunkCount: number;
  lastReadAt?: number;
  parentId?: string | null;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  totalChapters?: number | null;
  nextBookId?: string | null;
  prevBookId?: string | null;
  isPublic?: boolean;
  uploaderEmail?: string;
  uploaderName?: string;
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

export interface AdminUserStats {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  bookCount: number;
  readingCount: number;
  bookmarkCount: number;
  lastActive: string | null;
}

export interface AdminPublicBookStats {
  id: string;
  title: string;
  createdAt: string;
  blockCount: number;
  totalChapters: number | null;
  readersCount: number;
  avgProgress: number;
  bookmarksCount: number;
}

export interface AdminRecentActivity {
  id: string;
  userName: string;
  userEmail: string;
  bookTitle: string;
  bookId: string;
  percent: number;
  updatedAt: string;
}

export interface AdminDashboardData {
  totalUsers: number;
  totalBooks: number;
  totalPublicBooks: number;
  totalPrivateBooks: number;
  totalBookmarks: number;
  totalReadingSessions: number;
  users: AdminUserStats[];
  publicBooks: AdminPublicBookStats[];
  recentActivity: AdminRecentActivity[];
}
