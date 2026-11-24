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
