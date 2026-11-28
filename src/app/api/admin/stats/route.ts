import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

/**
 * GET /api/admin/stats
 * Admin dashboard analytics: user tracking, reading activity, public book popularity,
 * and comprehensive usage statistics for Scrollbound.
 * Strictly gated to shashankpulluri1@gmail.com.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access only (shashankpulluri1@gmail.com).' },
        { status: 403 }
      );
    }

    // 1. High-level KPI aggregations
    const [
      totalUsers,
      totalBooks,
      totalPublicBooks,
      totalPrivateBooks,
      totalBookmarks,
      totalReadingSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.book.count({ where: { parentId: null } }),
      prisma.book.count({ where: { isPublic: true, parentId: null } }),
      prisma.book.count({ where: { isPublic: false, parentId: null } }),
      prisma.bookmark.count(),
      prisma.progress.count(),
    ]);

    // 2. Fetch users and their engagement metrics
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            books: { where: { parentId: null } },
            progresses: true,
            bookmarks: true,
          },
        },
        progresses: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const users = rawUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      bookCount: u._count.books,
      readingCount: u._count.progresses,
      bookmarkCount: u._count.bookmarks,
      lastActive: u.progresses.length > 0 ? u.progresses[0].updatedAt.toISOString() : null,
    }));

    // 3. Public books performance & reader counts
    const publicBooksRaw = await prisma.book.findMany({
      where: { isPublic: true, parentId: null },
      select: {
        id: true,
        title: true,
        createdAt: true,
        blockCount: true,
        totalChapters: true,
        progress: {
          select: {
            percent: true,
            userId: true,
          },
        },
        _count: {
          select: {
            bookmarks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const publicBooks = publicBooksRaw.map((b) => {
      const distinctUsers = new Set(b.progress.map((p) => p.userId));
      const totalPercent = b.progress.reduce((acc, curr) => acc + curr.percent, 0);
      const avgProgress = b.progress.length > 0 ? Math.round(totalPercent / b.progress.length) : 0;

      return {
        id: b.id,
        title: b.title,
        createdAt: b.createdAt.toISOString(),
        blockCount: b.blockCount,
        totalChapters: b.totalChapters,
        readersCount: distinctUsers.size,
        avgProgress,
        bookmarksCount: b._count.bookmarks,
      };
    });

    // 4. Recent reading activity feed across the entire platform
    const recentActivityRaw = await prisma.progress.findMany({
      take: 25,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        percent: true,
        updatedAt: true,
        book: {
          select: {
            id: true,
            title: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const recentActivity = recentActivityRaw.map((a) => ({
      id: a.id,
      userName: a.user?.name || a.user?.email?.split('@')[0] || 'Anonymous',
      userEmail: a.user?.email || 'N/A',
      bookTitle: a.book?.title || 'Unknown Novel',
      bookId: a.book?.id || '',
      percent: Math.round(a.percent),
      updatedAt: a.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      totalUsers,
      totalBooks,
      totalPublicBooks,
      totalPrivateBooks,
      totalBookmarks,
      totalReadingSessions,
      users,
      publicBooks,
      recentActivity,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
