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

    const bookmarks = await prisma.bookmark.findMany({
      where: { bookId, userId: user.id },
      orderBy: { blockId: 'asc' },
    });

    return NextResponse.json({
      bookmarks: bookmarks.map((b) => ({
        id: b.id,
        bookId: b.bookId,
        blockId: b.blockId,
        snippet: b.snippet,
        note: b.note || undefined,
        createdAt: b.createdAt.getTime(),
      })),
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
    const { id, blockId, snippet, note } = body;

    const bookmark = await prisma.bookmark.create({
      data: {
        id: id || 'bm_' + Date.now(),
        bookId,
        userId: user.id,
        blockId,
        snippet,
        note: note || null,
      },
    });

    return NextResponse.json({
      bookmark: {
        id: bookmark.id,
        bookId: bookmark.bookId,
        blockId: bookmark.blockId,
        snippet: bookmark.snippet,
        note: bookmark.note || undefined,
        createdAt: bookmark.createdAt.getTime(),
      },
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Bookmark ID required' }, { status: 400 });
    }

    await prisma.bookmark.deleteMany({
      where: { id, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'Bookmark ID required' }, { status: 400 });
    }

    await prisma.bookmark.updateMany({
      where: { id, userId: user.id },
      data: { note: note || null },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
