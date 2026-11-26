import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ settings: null, customThemes: [] }, { status: 200 });
    }

    const [userData, customThemes] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { settings: true },
      }),
      prisma.customTheme.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const settingsObj = (userData?.settings as Record<string, any>) || null;
    let cleanSettings = settingsObj;
    if (settingsObj && '_syncLog' in settingsObj) {
      const { _syncLog, ...rest } = settingsObj;
      cleanSettings = rest;
    }

    return NextResponse.json({
      settings: cleanSettings,
      customThemes: customThemes.map((t) => ({
        id: t.id,
        name: t.name,
        bg: t.bg,
        text: t.text,
        accent: t.accent,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

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
          ...settings,
          _syncLog: currentObj._syncLog,
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
