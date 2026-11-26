import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: true, guest: true }, { status: 200 });
    }

    const body = await request.json();
    const { id, name, bg, text, accent } = body;

    const theme = await prisma.customTheme.upsert({
      where: { id: id || 'theme_' + Date.now() },
      create: {
        id: id || 'theme_' + Date.now(),
        userId: user.id,
        name,
        bg,
        text,
        accent,
      },
      update: {
        name,
        bg,
        text,
        accent,
      },
    });

    return NextResponse.json({ theme, success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: true, guest: true }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Theme ID required' }, { status: 400 });
    }

    await prisma.customTheme.deleteMany({
      where: { id, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
