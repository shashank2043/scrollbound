import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    const { bookId } = await context.params;

    const book = await prisma.book.findFirst({
      where: user
        ? {
            id: bookId,
            OR: [{ userId: user.id }, { isPublic: true }],
          }
        : {
            id: bookId,
            isPublic: true,
          },
    });

    if (!book) {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const chunks = await prisma.chunk.findMany({
      where: { bookId },
      orderBy: { index: 'asc' },
    });

    return NextResponse.json({
      chunks: chunks.map((c) => ({
        id: c.id,
        bookId: c.bookId,
        index: c.index,
        blocks: c.blocks,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;
    const body = await request.json();
    const { chunks } = body;

    if (!Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks provided' }, { status: 400 });
    }

    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    await prisma.chunk.createMany({
      data: chunks.map((c: { id: string; index: number; blocks: unknown }) => ({
        id: c.id,
        bookId,
        index: c.index,
        blocks: c.blocks as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, count: chunks.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
