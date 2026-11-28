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
    const { chapters } = body;

    if (!Array.isArray(chapters) || chapters.length === 0) {
      return NextResponse.json({ error: 'Invalid chapters data' }, { status: 400 });
    }

    const parentBook = await prisma.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: {
        progress: {
          where: { userId: user.id },
        },
      },
    });

    if (!parentBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const createdChapters = await prisma.$transaction(async (tx) => {
      // 1. Delete any previously generated chapters for this parent book
      await tx.book.deleteMany({
        where: { parentId: bookId, userId: user.id },
      });

      // 2. Update parent book's totalChapters
      await tx.book.update({
        where: { id: bookId },
        data: {
          totalChapters: chapters.length,
          updatedAt: new Date(),
        },
      });

      // 3. Insert each chapter and its chunks
      const savedList = [];
      for (const ch of chapters) {
        const created = await tx.book.create({
          data: {
            id: ch.id,
            userId: user.id,
            title: ch.title,
            parentId: bookId,
            chapterIndex: ch.chapterIndex,
            chapterTitle: ch.chapterTitle,
            totalChapters: chapters.length,
            nextBookId: ch.nextBookId || null,
            prevBookId: ch.prevBookId || null,
            blockCount: ch.blockCount || 0,
            chunkCount: ch.chunkCount || (ch.chunks?.length ?? 0),
          },
        });

        if (Array.isArray(ch.chunks) && ch.chunks.length > 0) {
          await tx.chunk.createMany({
            data: ch.chunks.map((c: { id: string; index: number; blocks: unknown }) => ({
              id: c.id,
              bookId: ch.id,
              index: c.index,
              blocks: c.blocks as Prisma.InputJsonValue,
            })),
          });
        }

        savedList.push(created);
      }

      // 4. Migrate user's existing reading progress to the appropriate chapter if available
      if (parentBook.progress.length > 0) {
        const oldProg = parentBook.progress[0];
        // Find which chapter encompasses oldProg.blockId
        let accumulatedBlocks = 0;
        let matchedChapter = savedList[0];
        let relativeBlockId = oldProg.blockId;

        for (const ch of savedList) {
          if (
            oldProg.blockId >= accumulatedBlocks &&
            oldProg.blockId < accumulatedBlocks + ch.blockCount
          ) {
            matchedChapter = ch;
            relativeBlockId = oldProg.blockId - accumulatedBlocks;
            break;
          }
          accumulatedBlocks += ch.blockCount;
        }

        if (matchedChapter) {
          const chapterPercent =
            matchedChapter.blockCount > 0
              ? Math.min(100, Math.round((relativeBlockId / matchedChapter.blockCount) * 100))
              : 0;

          await tx.progress.upsert({
            where: {
              userId_bookId: {
                userId: user.id,
                bookId: matchedChapter.id,
              },
            },
            update: {
              blockId: relativeBlockId,
              offset: oldProg.offset,
              percent: chapterPercent,
              updatedAt: new Date(),
            },
            create: {
              userId: user.id,
              bookId: matchedChapter.id,
              blockId: relativeBlockId,
              offset: oldProg.offset,
              percent: chapterPercent,
            },
          });
        }
      }

      return savedList;
    });

    return NextResponse.json({
      success: true,
      chaptersCount: createdChapters.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
