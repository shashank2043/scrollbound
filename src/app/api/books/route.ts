import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const books = await prisma.book.findMany({
      where: { userId: user.id },
      include: {
        progress: {
          where: { userId: user.id },
        },
      },
      orderBy: [
        { lastReadAt: 'desc' },
        { updatedAt: 'desc' },
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
      if (b.progress.length > 0) {
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
      };
    });

    return NextResponse.json({ books: formattedBooks, progressMap });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, blockCount, chunkCount, chunks } = body;

    if (!id || !title || !Array.isArray(chunks)) {
      return NextResponse.json({ error: 'Invalid book payload.' }, { status: 400 });
    }

    // Save in transaction: Book + Chunks (blocks are stored as JSON in chunks. No raw PDF is saved!)
    const book = await prisma.$transaction(async (tx) => {
      const createdBook = await tx.book.create({
        data: {
          id,
          userId: user.id,
          title: title.trim(),
          blockCount: blockCount || 0,
          chunkCount: chunkCount || chunks.length,
        },
      });

      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((c: { id: string; index: number; blocks: unknown }) => ({
            id: c.id,
            bookId: id,
            index: c.index,
            blocks: c.blocks as Prisma.InputJsonValue,
          })),
        });
      }

      return createdBook;
    });

    return NextResponse.json({
      book: {
        id: book.id,
        title: book.title,
        createdAt: book.createdAt.getTime(),
        updatedAt: book.updatedAt.getTime(),
        blockCount: book.blockCount,
        chunkCount: book.chunkCount,
      },
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
