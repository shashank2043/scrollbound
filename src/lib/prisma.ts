import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getOptimizedDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scrollbound';

  // If connecting to Supabase transaction pooler (port 6543 or pgbouncer)
  // Ensure connection_limit=1 is set to prevent pool exhaustion (ECHECKOUTTIMEOUT)
  if (url.includes(':6543') || url.includes('pgbouncer=true')) {
    if (!url.includes('connection_limit')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}connection_limit=1`;
    }
  }
  return url;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getOptimizedDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Always cache prisma instance globally across both dev and production
// to prevent multiple connection pools in serverless/route handlers
globalForPrisma.prisma = prisma;
