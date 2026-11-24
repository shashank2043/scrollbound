import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;
    const body = await request.json();
    const { newChunks, addedBlockCount, totalNewChunkCount } = body;

    if (!Array.isArray(newChunks)) {
      return NextResponse.json({ error: 'Invalid chunks' }, { status: 400 });
    }

    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedBook = await tx.book.update({
        where: { id: bookId },
        data: {
          blockCount: book.blockCount + (addedBlockCount || 0),
          chunkCount: book.chunkCount + (totalNewChunkCount ?? newChunks.length),
          updatedAt: new Date(),
        },
      });

      if (newChunks.length > 0) {
        await tx.chunk.createMany({
          data: newChunks.map((c: { id: string; index: number; blocks: unknown }) => ({
            id: c.id,
            bookId: bookId,
            index: c.index,
            blocks: c.blocks as Prisma.InputJsonValue,
          })),
        });
      }

      return updatedBook;
    });

    return NextResponse.json({
      book: {
        id: updated.id,
        title: updated.title,
        createdAt: updated.createdAt.getTime(),
        updatedAt: updated.updatedAt.getTime(),
        blockCount: updated.blockCount,
        chunkCount: updated.chunkCount,
      },
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
