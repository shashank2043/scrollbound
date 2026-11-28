import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
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
  plugins: [
    nextCookies(),
  ],
  session: {
    modelName: 'Session',
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes signed cookie cache to prevent database pool exhaustion
    },
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 1 day
  },
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
export async function getCurrentUser(request?: Request) {
  try {
    let reqHeaders: Headers;
    if (request && request.headers) {
      reqHeaders = request.headers;
    } else {
      try {
        reqHeaders = await headers();
      } catch {
        // During static prerendering or outside request context
        return null;
      }
    }

    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (!session || !session.user) {
      return null;
    }

    try {
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

      return user || (session.user as unknown as typeof user);
    } catch (dbErr) {
      // If PostgreSQL connection pool is busy or reconnecting, fall back to valid session user
      console.warn('[getCurrentUser] Database fetch failed, falling back to session user:', dbErr);
      return session.user as unknown as {
        id: string;
        email: string;
        name: string | null;
        image: string | null;
        settings: unknown;
        createdAt: Date;
      };
    }
  } catch (err) {
    console.warn('[getCurrentUser] Session retrieval failed:', err);
    return null;
  }
}
