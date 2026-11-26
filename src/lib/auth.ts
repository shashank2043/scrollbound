import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';
import { headers } from 'next/headers';

function getAuthBaseURL(): string {
  // If explicitly set and not localhost
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes('localhost')) {
    return process.env.BETTER_AUTH_URL.replace(/\/$/, '');
  }
  // Vercel production or preview URLs
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  return process.env.BETTER_AUTH_URL || 'http://localhost:3000';
}

const baseURL = getAuthBaseURL();

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

// If explicitly provided via GOOGLE_REDIRECT_URI environment variable
const googleRedirectURI = process.env.GOOGLE_REDIRECT_URI || undefined;

export const isGoogleAuthEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL,
  trustedOrigins: async (request) => {
    const origins = [
      'http://localhost:3000',
      'https://*.vercel.app',
      '*.vercel.app',
    ];

    if (process.env.BETTER_AUTH_URL) {
      origins.push(process.env.BETTER_AUTH_URL.replace(/\/$/, ''));
    }
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
    }
    if (process.env.VERCEL_URL) {
      origins.push(`https://${process.env.VERCEL_URL}`);
    }

    if (request) {
      const origin = request.headers.get('origin');
      if (origin) {
        origins.push(origin);
      }
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const parsed = new URL(referer);
          origins.push(parsed.origin);
        } catch {}
      }
    }

    return Array.from(new Set(origins));
  },
  secret:
    process.env.BETTER_AUTH_SECRET ||
    process.env.JWT_SECRET ||
    'scrollbound-better-auth-fallback-secret-2026',
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: googleClientId || 'NOT_CONFIGURED',
      clientSecret: googleClientSecret || 'NOT_CONFIGURED',
      enabled: isGoogleAuthEnabled,
      ...(googleRedirectURI ? { redirectURI: googleRedirectURI } : {}),
    },
  },
  user: {
    modelName: 'User',
  },
  session: {
    modelName: 'Session',
  },
  account: {
    modelName: 'Account',
  },
  verification: {
    modelName: 'Verification',
  },
});

/**
 * Retrieve the currently authenticated user from Better Auth session.
 * Used by all internal API routes (books, chunks, progress, bookmarks, settings).
 */
export async function getCurrentUser() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        settings: true,
        createdAt: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}
