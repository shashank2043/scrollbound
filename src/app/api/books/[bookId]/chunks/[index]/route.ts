import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ bookId: string; index: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    const { bookId, index: indexStr } = await context.params;
    const index = parseInt(indexStr, 10);

    const chunk = await prisma.chunk.findFirst({
      where: {
        bookId,
        index,
        book: user
          ? {
              OR: [{ userId: user.id }, { isPublic: true }],
            }
          : {
              isPublic: true,
            },
      },
    });

    if (!chunk) {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ chunk: null }, { status: 404 });
    }

    return NextResponse.json({
      chunk: {
        id: chunk.id,
        bookId: chunk.bookId,
        index: chunk.index,
        blocks: chunk.blocks,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
