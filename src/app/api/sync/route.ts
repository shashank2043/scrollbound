import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { SyncLogEntry, MAX_SYNC_LOG_ENTRIES } from '@/lib/syncEngine';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ syncLog: [] }, { status: 200 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });

    const settingsObj = (userData?.settings as Record<string, any>) || {};
    const syncLog = Array.isArray(settingsObj._syncLog) ? settingsObj._syncLog : [];

    return NextResponse.json({
      syncLog: syncLog.slice(-MAX_SYNC_LOG_ENTRIES),
      serverTime: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const serverStart = performance.now();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const actions: SyncLogEntry[] = Array.isArray(body.actions) ? body.actions : [];

    if (actions.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Process actions sequentially to guarantee order
    for (const item of actions) {
      const { action, payload } = item;
      try {
        switch (action) {
          case 'UPDATE_PROGRESS': {
            if (payload && payload.bookId) {
              await prisma.progress.upsert({
                where: {
                  userId_bookId: {
                    userId: user.id,
                    bookId: payload.bookId,
                  },
                },
                update: {
                  blockId: payload.blockId,
                  offset: payload.offset,
                  percent: payload.percent,
                  updatedAt: new Date(payload.updatedAt || Date.now()),
                },
                create: {
                  userId: user.id,
                  bookId: payload.bookId,
                  blockId: payload.blockId,
                  offset: payload.offset,
                  percent: payload.percent,
                  updatedAt: new Date(payload.updatedAt || Date.now()),
                },
              });
            }
            break;
          }

          case 'ADD_BOOKMARK': {
            if (payload && payload.id && payload.bookId) {
              await prisma.bookmark.upsert({
                where: { id: payload.id },
                update: {
                  snippet: payload.snippet,
                  note: payload.note || null,
                },
                create: {
                  id: payload.id,
                  userId: user.id,
                  bookId: payload.bookId,
                  blockId: payload.blockId,
                  snippet: payload.snippet,
                  note: payload.note || null,
                  createdAt: new Date(payload.createdAt || Date.now()),
                },
              });
            }
            break;
          }

          case 'DELETE_BOOKMARK': {
            if (payload && payload.id) {
              await prisma.bookmark.deleteMany({
                where: {
                  id: payload.id,
                  userId: user.id,
                },
              });
            }
            break;
          }

          case 'UPDATE_BOOKMARK_NOTE': {
            if (payload && payload.id) {
              await prisma.bookmark.updateMany({
                where: {
                  id: payload.id,
                  userId: user.id,
                },
                data: {
                  note: payload.note,
                },
              });
            }
            break;
          }

          case 'SAVE_SETTINGS': {
            if (payload && payload.settings) {
              const current = await prisma.user.findUnique({
                where: { id: user.id },
                select: { settings: true },
              });
              const currentObj = (current?.settings as Record<string, any>) || {};
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  settings: {
                    ...currentObj,
                    ...payload.settings,
                    _syncLog: currentObj._syncLog,
                  } as unknown as Prisma.InputJsonValue,
                },
              });
            }
            break;
          }

          case 'SAVE_THEME': {
            if (payload && payload.id) {
              await prisma.customTheme.upsert({
                where: { id: payload.id },
                update: {
                  name: payload.name,
                  bg: payload.bg,
                  text: payload.text,
                  accent: payload.accent,
                },
                create: {
                  id: payload.id,
                  userId: user.id,
                  name: payload.name,
                  bg: payload.bg,
                  text: payload.text,
                  accent: payload.accent,
                },
              });
            }
            break;
          }

          case 'DELETE_THEME': {
            if (payload && payload.id) {
              await prisma.customTheme.deleteMany({
                where: {
                  id: payload.id,
                  userId: user.id,
                },
              });
            }
            break;
          }

          case 'DELETE_BOOK': {
            if (payload && payload.id) {
              await prisma.book.deleteMany({
                where: {
                  id: payload.id,
                  userId: user.id,
                },
              });
            }
            break;
          }
        }
      } catch (opErr) {
        console.error(`Error reconciling sync action ${action}:`, opErr);
      }
    }

    // Now update cloud sync log (keeping last 50 actions)
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });

    const settingsObj = (userData?.settings as Record<string, any>) || {};
    const existingLog: SyncLogEntry[] = Array.isArray(settingsObj._syncLog)
      ? settingsObj._syncLog
      : [];

    const serverElapsed = Math.round(performance.now() - serverStart);
    console.log(
      `[Scrollbound API /api/sync] Processed ${actions.length} action(s) in ${serverElapsed}ms for user ${user.id}`
    );

    // Mark reconciled actions as synced in cloud log and preserve execution time
    const syncedActions: SyncLogEntry[] = actions.map((a) => ({
      ...a,
      durationMs: a.durationMs || serverElapsed,
      status: 'synced',
      error: undefined,
    }));

    const combinedLog = [...existingLog, ...syncedActions].slice(-MAX_SYNC_LOG_ENTRIES);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        settings: {
          ...settingsObj,
          _syncLog: combinedLog,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      processed: actions.length,
      serverElapsedMs: serverElapsed,
      cloudSyncLog: combinedLog,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
