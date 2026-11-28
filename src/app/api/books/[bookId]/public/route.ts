import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

/**
 * PATCH /api/books/[bookId]/public
 * Toggles a book's isPublic state.
 * Only the designated admin (shashankpulluri1@gmail.com) can publish or unpublish novels.
 * Automatically propagates public status to all split child chapters.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json(
        { error: 'Forbidden: Only the admin (shashankpulluri1@gmail.com) can modify public library books.' },
        { status: 403 }
      );
    }

    const { bookId } = await context.params;
    const body = await request.json();
    const { isPublic } = body;

    if (typeof isPublic !== 'boolean') {
      return NextResponse.json({ error: 'isPublic must be a boolean' }, { status: 400 });
    }

    // Verify book exists and belongs to admin
    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Update parent book and any child chapters atomically
    await prisma.$transaction([
      prisma.book.update({
        where: { id: bookId },
        data: { isPublic },
      }),
      prisma.book.updateMany({
        where: { parentId: bookId },
        data: { isPublic },
      }),
    ]);

    return NextResponse.json({
      success: true,
      bookId,
      isPublic,
      message: isPublic ? 'Book published to Public Library' : 'Book moved to Private Library',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
