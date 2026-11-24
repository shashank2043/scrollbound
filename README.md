# Scrollbound 📜

**Scrollbound** is a personal novel reader for the browser, powered by Next.js (App Router), TypeScript, Tailwind CSS, `pdfjs-dist`, and a local **PostgreSQL** database managed via **Prisma ORM**.

Upload any PDF novel, and Scrollbound extracts the text in memory, reflows it into clean, responsive typography for any screen size, and persists all books, reading progress, bookmarks, and user settings to PostgreSQL.

---

## Key Highlights

- **PostgreSQL Database Storage**: All novel chunks, reading positions, bookmarks, custom themes, and user settings are persisted to a PostgreSQL database (`postgresql://postgres:postgres@localhost:5432/scrollbound`).
- **User Authentication with Better Auth**: Modern authentication powered by **Better Auth** with both **Google OAuth ("Login with Google")** and email/password sign-in. Profiles feature user avatar photos and secure session management.
- **Privacy First (PDFs Never Stored)**: The original PDF is read into memory, parsed page-by-page into clean text blocks, and then immediately discarded. The raw PDF file is **never** saved to PostgreSQL or the filesystem.
- **High Performance & Large Novels**: Efficiently handles 1000+ page novels without freezing the UI by processing page-by-page and yielding to the main thread.
- **Chunked Storage & Infinite Lazy Loading**: Stored in PostgreSQL in 200-block records (`Chunk`). Loads lazily as you scroll, rendering novels with 100k+ words with zero lag.
- **Exact Position Tracking**: Tracks position by `{ blockId, offsetWithinBlock }` of the topmost paragraph in view. Resumes at the exact reading spot across restarts, screen resizing, or font size changes.
- **Collapsible Floating Toolbar**: Hides automatically while scrolling down to keep reading immersive; smoothly appears when scrolling up.
- **Bookmarks & Annotations**: Tap or click any paragraph to bookmark it, add custom notes, and jump directly back to that paragraph anytime via the bookmarks drawer.
- **Custom Theming & Typography**: Built-in Light, Dark, and Sepia presets, plus a custom theme creator with live WCAG contrast checking. Adjustable font size (14–32px), font family (Serif, Sans, **Poppins**, Dyslexia-friendly, Mono), line height, and content width.
- **Append PDFs**: Add sequels or next volumes to an existing book while keeping previous reading progress and bookmarks intact.
- **Full JSON Backup**: Export and import your library with a single click.

---

## Database Configuration & Supabase Deployment

Scrollbound uses **Prisma ORM** with **PostgreSQL**. It supports local PostgreSQL as well as cloud-hosted databases such as **Supabase** with connection pooling.

### Supabase + Vercel Architecture

In a serverless environment like Vercel, serverless functions can quickly exhaust standard PostgreSQL connection limits. Supabase provides two connection URLs:

1. **`DATABASE_URL` (Transaction Connection Pooler - Port 6543)**:
   - Uses Supabase's Supavisor / PgBouncer pooler.
   - Appending `?pgbouncer=true` tells Prisma Client to operate without prepared statement conflicts in pooled mode.
   - Used by the Next.js runtime when executing queries.

2. **`DIRECT_URL` (Direct Connection - Port 5432)**:
   - Direct connection to PostgreSQL.
   - Used exclusively by the Prisma CLI for schema migrations and `prisma db push` (connection poolers in transaction mode block DDL migrations).

---

## Step-by-Step Deployment Guide (Supabase + Vercel)

### 1. Set Up Supabase Database

1. Create a free account at [Supabase](https://supabase.com) and create a new project.
2. Once the project is provisioned, go to **Project Settings** (gear icon) -> **Database**.
3. Scroll down to **Connection string** and select the **URI** tab:
   - Under **Mode**, select **Transaction** (port `6543`). Copy this URI. Replace `[YOUR-PASSWORD]` with your database password. Add `?pgbouncer=true` to the end if not present. This is your `DATABASE_URL`.
   - Under **Mode**, select **Session** or **Direct** (port `5432`). Copy this URI. Replace `[YOUR-PASSWORD]` with your database password. This is your `DIRECT_URL`.

### 2. Push Schema to Supabase

Before deploying, push the Prisma schema to your Supabase instance from your terminal:

```bash
# Set your Supabase connection strings in your terminal or in .env:
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Push schema directly to Supabase
pnpm db:push
# or: npx prisma db push
```

This creates the `users`, `books`, `chunks`, `progress`, `bookmarks`, and `custom_themes` tables with all required foreign keys and cascade rules.

### 3. Deploy to Vercel

1. Push your repository to GitHub, GitLab, or Bitbucket.
2. Log in to [Vercel](https://vercel.com) and click **"Add New..."** -> **"Project"**.
3. Import your `scrollbound` repository.
4. In the **Configure Project** screen, open **Environment Variables** and add:
   - `DATABASE_URL`: Your Supabase transaction pooler URI (port `6543`, with `?pgbouncer=true`)
   - `DIRECT_URL`: Your Supabase direct connection URI (port `5432`)
   - `BETTER_AUTH_SECRET`: A secure random 32+ character string (e.g. run `openssl rand -base64 32`)
   - `BETTER_AUTH_URL`: Your Vercel production URL (e.g. `https://scrollbound.vercel.app`)
   - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID (optional, for Google Sign-In)
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret (optional, for Google Sign-In)
5. Click **Deploy**.

---

## Google OAuth Setup Guide

To enable **"Continue with Google"**:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project.
3. Navigate to **APIs & Services** ➔ **OAuth consent screen**:
   - Set User Type to **External**.
   - Fill in the App name (`Scrollbound`), user support email, and developer contact email.
4. Navigate to **APIs & Services** ➔ **Credentials**:
   - Click **+ Create Credentials** ➔ **OAuth client ID**.
   - Select **Application type**: **Web application**.
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for local development)
     - `https://your-project.vercel.app` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/callback/google` (for local development)
     - `https://your-project.vercel.app/api/auth/callback/google` (for production)
5. Click **Create** and copy your **Client ID** and **Client Secret**.
6. Paste them into `.env` (locally) and into your Vercel Project Environment Variables:
   ```env
   GOOGLE_CLIENT_ID="1234567890-abcdef.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxx"
   ```

Vercel will run `prisma generate && next build` automatically during the build step and deploy your personal novel reader to the edge!

---

## Local Development

- **users**: `id`, `email`, `name`, `passwordHash`, `settings` (JSON), `createdAt`, `updatedAt`
- **books**: `id`, `userId`, `title`, `blockCount`, `chunkCount`, `lastReadAt`, `createdAt`, `updatedAt`
- **chunks**: `id` (`${bookId}:${index}`), `bookId`, `index`, `blocks` (JSON array of text blocks)
- **progress**: `id`, `userId`, `bookId`, `blockId`, `offset`, `percent`, `updatedAt`
- **bookmarks**: `id`, `userId`, `bookId`, `blockId`, `snippet`, `note`, `createdAt`
- **custom_themes**: `id`, `userId`, `name`, `bg`, `text`, `accent`, `createdAt`

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (tested with Node.js 24)
- PostgreSQL running locally on port 5432 (default user: `postgres`, password: `postgres`)
- `pnpm` (or `npm`)

### 2. Database Sync
Push the schema to PostgreSQL:
```bash
pnpm exec prisma db push
```

### 3. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
pnpm build
pnpm start
```

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
   - Stored in PostgreSQL in 200-block records (`Chunk`) with JSON arrays of blocks.

---

## License

MIT
