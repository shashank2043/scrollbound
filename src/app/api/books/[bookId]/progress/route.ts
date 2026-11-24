import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;

    const prog = await prisma.progress.findUnique({
      where: {
        userId_bookId: {
          userId: user.id,
          bookId,
        },
      },
    });

    if (!prog) {
      return NextResponse.json({ progress: null });
    }

    return NextResponse.json({
      progress: {
        bookId: prog.bookId,
        blockId: prog.blockId,
        offset: prog.offset,
        percent: prog.percent,
        updatedAt: prog.updatedAt.getTime(),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await context.params;
    const body = await request.json();
    const { blockId, offset, percent } = body;

    const now = new Date();

    const prog = await prisma.$transaction(async (tx) => {
      const saved = await tx.progress.upsert({
        where: {
          userId_bookId: {
            userId: user.id,
            bookId,
          },
        },
        create: {
          userId: user.id,
          bookId,
          blockId: blockId || 0,
          offset: offset || 0,
          percent: percent || 0,
          updatedAt: now,
        },
        update: {
          blockId: blockId || 0,
          offset: offset || 0,
          percent: percent || 0,
          updatedAt: now,
        },
      });

      await tx.book.update({
        where: { id: bookId },
        data: { lastReadAt: now },
      });

      return saved;
    });

    return NextResponse.json({
      progress: {
        bookId: prog.bookId,
        blockId: prog.blockId,
        offset: prog.offset,
        percent: prog.percent,
        updatedAt: prog.updatedAt.getTime(),
      },
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
