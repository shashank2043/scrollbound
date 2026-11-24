# Scrollbound 📜

**Scrollbound** is a personal, single-user novel reader for the browser. Upload any PDF novel, and Scrollbound extracts the text and reflows it into clean, responsive, distraction-free typography for any screen size—from mobile phones to ultrawide displays.

Built with Next.js (App Router), TypeScript, Tailwind CSS, `pdfjs-dist`, and `idb`.

---

## Key Highlights

- **100% Client-Side & Zero Backend**: No backend, no database, no auth, and no cloud dependencies. Everything runs locally in your browser.
- **Privacy First (PDFs Never Stored)**: The original PDF is read into memory, parsed page-by-page into clean text blocks, and then immediately discarded. The raw PDF file is **never** saved to IndexedDB, localStorage, or your filesystem.
- **High Performance & Large Novels**: Efficiently handles 1000+ page novels without freezing the UI by processing page-by-page and yielding to the main thread.
- **Chunked Storage & Infinite Lazy Loading**: Stored in IndexedDB in 200-block chunks. Loads lazily as you scroll, rendering novels with 100k+ words with zero lag.
- **Exact Position Tracking**: Tracks position by `{ blockId, offsetWithinBlock }` of the topmost paragraph in view. Resumes at the exact reading spot across restarts, screen resizing, or font size changes.
- **Collapsible Floating Toolbar**: Hides automatically while scrolling down to keep reading immersive; smoothly appears when scrolling up.
- **Bookmarks & Annotations**: Tap or click any paragraph to bookmark it, add custom notes, and jump directly back to that paragraph anytime via the bookmarks drawer.
- **Custom Theming & Typography**: Built-in Light, Dark, and Sepia presets, plus a custom theme creator with live WCAG contrast checking. Adjustable font size (14–32px), font family (Serif, Sans, Dyslexia-friendly, Mono), line height, and content width.
- **Append PDFs**: Add sequels or next volumes to an existing book while keeping previous reading progress and bookmarks intact.
- **Full JSON Backup & Storage Persistence**: Export and import your entire library with a single click, and request browser persistent storage (`navigator.storage.persist()`).

---

## How Text Extraction & Cleanup Works

PDF files store positioned visual glyphs and fragmented text runs rather than structured, semantic paragraphs. Scrollbound's extraction pipeline (`src/lib/pdf/extract.ts` and `src/lib/pdf/cleanup.ts`) transforms these fragments into clean literature:

1. **Non-blocking Extraction**:
   - `pdfjs-dist` is dynamically imported on the client side with a statically served web worker (`public/pdf.worker.min.mjs`).
   - The document is processed page-by-page. After each page, execution yields to the browser's event loop (`await new Promise(r => setTimeout(r, 0))`), keeping the UI responsive with an import progress indicator.
   - Detects image-only / scanned PDFs (less than 30 characters extracted across the entire document) and reports a clear error indicating OCR would be needed.

2. **Geometric Baseline Sorting & Line Grouping**:
   - PDF coordinate systems place $(0, 0)$ at the bottom-left. Text coordinates are converted into top-down viewport space (`top = viewport.height - ty`).
   - Glyphs sharing the same vertical baseline (within a $3.5\text{ pt}$ tolerance) are clustered into visual lines.
   - Text items along the line are sorted horizontally by $x$ position and joined with spaces when horizontal gaps exceed character spacing.

3. **Running Header, Footer, and Page Number Elimination**:
   - Recurring lines in the top 12% and bottom 12% of pages are analyzed across the document.
   - Repeating headers (such as author names, novel titles, or running chapter titles) and footers are identified and filtered out.
   - Standalone page numbers (`12`, `- 12 -`, `Page 12 of 300`, `xiv`) in margins are identified via regular expressions and discarded.

4. **Paragraph Break Detection**:
   Paragraph boundaries are detected through geometric cues rather than hard line wraps:
   - **Vertical gaps**: Line spacing greater than $1.45\times$ the median body line gap triggers a new paragraph.
   - **Indentation**: Lines indented by $>12\text{ pt}$ past the standard left margin start a new paragraph.
   - **Terminal lines**: Lines ending significantly shorter ($<70\%$ median line width) without terminal hyphens indicate paragraph ends.

5. **Hyphenation Repair & Line Reflowing**:
   - Hyphenated line breaks (`"exam-"` followed by `"ple"`) are automatically detected and joined into `"example"`.
   - Multi-line paragraphs are reflowed into single continuous text blocks with normalized whitespace.

6. **Heading Detection**:
   - Short lines matching explicit patterns (`Chapter N`, `Prologue`, `Book II`, `ACT 1`, etc.), all-caps titles, or lines with distinctively larger font sizes are tagged as `heading` blocks; body paragraphs are tagged as `paragraph` blocks.
   - Stored with sequential, immutable integer IDs (`0, 1, 2, ...`) and split into 200-block records in IndexedDB.

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested with Node.js 24)
- `pnpm` (or `npm`)

### Installation & Run

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Start development server**:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Build for production**:
   ```bash
   pnpm build
   pnpm start
   ```

4. **Run linter**:
   ```bash
   pnpm lint
   ```

---

## Project Structure

```
scrollbound/
├── public/
│   └── pdf.worker.min.mjs          # PDF.js worker served statically
├── src/
│   ├── app/
│   │   ├── (library)/page.tsx      # Library view (home page)
│   │   ├── read/[bookId]/page.tsx  # Reader view
│   │   ├── globals.css             # Tailwind & CSS variable themes
│   │   └── layout.tsx              # Root layout & anti-flash theme bootstrap
│   ├── components/
│   │   ├── AddBookModal.tsx        # PDF file picker, title prompt, progress
│   │   ├── AppendBookModal.tsx     # Append PDF to existing book
│   │   ├── BackupModal.tsx         # JSON export/import & persistent storage
│   │   ├── BookCard.tsx            # Library book card with % progress & menu
│   │   ├── BookmarksDrawer.tsx     # Bookmarks slideover with note editing
│   │   ├── DeleteConfirmModal.tsx  # Delete confirmation dialog
│   │   ├── LibraryHeader.tsx       # Library navigation header
│   │   ├── ReaderContent.tsx       # Lazy-loaded chunk reader with position tracker
│   │   ├── ReaderToolbar.tsx       # Auto-hiding floating toolbar & progress bar
│   │   ├── SettingsModal.tsx       # Typography & appearance modal
│   │   └── ThemePicker.tsx         # Preset & custom themes with WCAG contrast check
│   ├── hooks/
│   │   ├── useProgress.ts          # Debounced reading position save & restore
│   │   └── useSettings.ts          # Appearance state & CSS variable injector
│   └── lib/
│       ├── db.ts                   # IndexedDB storage layer (idb)
│       ├── theme.ts                # Themes, fonts & WCAG contrast calculation
│       ├── types.ts                # TypeScript data models
│       └── pdf/
│           ├── cleanup.ts          # Line grouping, header filtering & paragraph reflow
│           └── extract.ts          # PDF.js document loader & page iterator
└── package.json
```

---

## License

MIT
