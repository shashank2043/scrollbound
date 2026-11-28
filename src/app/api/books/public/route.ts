import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/books/public
 * Returns all public books in Scrollbound.
 * If the requesting user is authenticated, their personal reading progress on these
 * public books is also queried and returned in progressMap.
 */
export async function GET(request?: Request) {
  try {
    const user = request ? await getCurrentUser(request) : null;

    // Fetch all public books (top-level novels)
    const books = await prisma.book.findMany({
      where: {
        isPublic: true,
        parentId: null,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        progress: user
          ? {
              where: { userId: user.id },
            }
          : false,
      },
      orderBy: [
        { lastReadAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const progressMap: Record<string, {
      bookId: string;
      blockId: number;
      offset: number;
      percent: number;
      updatedAt: number;
    }> = {};

    const formattedBooks = books.map((b) => {
      if (user && b.progress && b.progress.length > 0) {
        const p = b.progress[0];
        progressMap[b.id] = {
          bookId: p.bookId,
          blockId: p.blockId,
          offset: p.offset,
          percent: p.percent,
          updatedAt: p.updatedAt.getTime(),
        };
      }

      return {
        id: b.id,
        title: b.title,
        createdAt: b.createdAt.getTime(),
        updatedAt: b.updatedAt.getTime(),
        lastReadAt: b.lastReadAt ? b.lastReadAt.getTime() : undefined,
        blockCount: b.blockCount,
        chunkCount: b.chunkCount,
        parentId: b.parentId,
        chapterIndex: b.chapterIndex,
        chapterTitle: b.chapterTitle,
        totalChapters: b.totalChapters,
        nextBookId: b.nextBookId,
        prevBookId: b.prevBookId,
        isPublic: true,
        uploaderEmail: b.user?.email,
        uploaderName: b.user?.name || undefined,
      };
    });

    return NextResponse.json({
      books: formattedBooks,
      progressMap,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
