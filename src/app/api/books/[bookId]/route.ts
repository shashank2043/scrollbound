import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;

    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    return NextResponse.json({
      book: {
        id: book.id,
        title: book.title,
        createdAt: book.createdAt.getTime(),
        updatedAt: book.updatedAt.getTime(),
        lastReadAt: book.lastReadAt ? book.lastReadAt.getTime() : undefined,
        blockCount: book.blockCount,
        chunkCount: book.chunkCount,
        parentId: book.parentId,
        chapterIndex: book.chapterIndex,
        chapterTitle: book.chapterTitle,
        totalChapters: book.totalChapters,
        nextBookId: book.nextBookId,
        prevBookId: book.prevBookId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;

    await prisma.book.deleteMany({
      where: { id: bookId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
