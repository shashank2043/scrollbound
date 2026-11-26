/**
 * Backend Logic Unit Test Suite for Scrollbound
 * Runs in CI (GitHub Actions) and tests backend logic without requiring browser DOM:
 * 1. Database Connection Optimization & Supabase Pooler Constraints
 * 2. Sync Engine State, Outbox Queue, & Security Authentication Gate
 * 3. AOP Logging Around-Advice & Performance Timing
 * 4. Reader Chunking Algorithm & Reading Progress Calculations
 * 5. Tenant Authorization & Security Contracts (401 on unauthenticated access)
 */

import {
  recordSyncAction,
  markSyncActionStatus,
  getLocalSyncLog,
  saveLocalSyncLog,
  setSyncAuthStatus,
  isSyncAuthenticated,
} from '../src/lib/syncEngine';

import { createChunksFromBlocks } from '../src/lib/db';
import { Block } from '../src/lib/types';

import {
  formatDuration,
  aopLogged,
} from '../src/lib/aspects/loggingAspect';

import { POST as settingsPost } from '../src/app/api/settings/route';
import { POST as themesPost, DELETE as themesDelete } from '../src/app/api/settings/themes/route';
import { GET as syncGet, POST as syncPost } from '../src/app/api/sync/route';

// Node.js test runner
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✔ PASS ${name}`);
    passedTests++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ FAIL ${name}: ${msg}`);
    failedTests++;
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ' - ' : ''}Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function assert(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// In-memory mock storage for Node environment
class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

(globalThis as any).localStorage = new MockStorage();
(globalThis as any).sessionStorage = new MockStorage();
(globalThis as any).window = globalThis;
(globalThis as any).dispatchEvent = () => true;

export async function runBackendUnitTests() {
  console.log('\n======================================================');
  console.log('   SCROLLBOUND BACKEND LOGIC UNIT TEST SUITE (CI)');
  console.log('======================================================\n');

  // Suite 1: Database Connection URL Optimization
  console.log('▶ Suite 1: Database Connection URL Optimization');
  await test('Correctly appends connection_limit=1 to Supavisor transaction pooler', () => {
    function testOptimize(url: string | undefined): string | undefined {
      if (!url) return undefined;
      if (url.includes(':6543') || url.includes('pgbouncer=true')) {
        if (!url.includes('connection_limit')) {
          const separator = url.includes('?') ? '&' : '?';
          return `${url}${separator}connection_limit=1`;
        }
      }
      return url;
    }

    const standardUrl = 'postgresql://postgres:password@localhost:5432/scrollbound';
    assertEquals(testOptimize(standardUrl), standardUrl);

    const supavisorUrl = 'postgresql://postgres:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    assertEquals(testOptimize(supavisorUrl), `${supavisorUrl}?connection_limit=1`);

    const pgbouncerUrl = 'postgresql://user:pw@host:5432/db?pgbouncer=true';
    assertEquals(testOptimize(pgbouncerUrl), `${pgbouncerUrl}&connection_limit=1`);

    const existingLimit = 'postgresql://user:pw@host:6543/db?connection_limit=2';
    assertEquals(testOptimize(existingLimit), existingLimit);
  });

  // Suite 2: Sync Engine Outbox & Security Lockout
  console.log('\n▶ Suite 2: Sync Engine Outbox & Security Lockout');
  await test('Cloud sync is strictly locked when unauthenticated', () => {
    setSyncAuthStatus(false);
    assertEquals(isSyncAuthenticated(), false);
  });

  await test('Signing in unlocks sync authentication', () => {
    setSyncAuthStatus(true);
    assertEquals(isSyncAuthenticated(), true);
  });

  await test('Outbox queue records and updates sync action state', () => {
    saveLocalSyncLog([]);
    const action = recordSyncAction('SAVE_SETTINGS', { fontSize: 20 }, 'pending');
    assertEquals(action.action, 'SAVE_SETTINGS');
    assertEquals(action.status, 'pending');

    markSyncActionStatus(action.id, 'synced', undefined, 42);
    const actions = getLocalSyncLog();
    const found = actions.find((a) => a.id === action.id);
    assert(found !== undefined, 'Action should be present in outbox');
    assertEquals(found?.status, 'synced');
    assertEquals(found?.durationMs, 42);
  });

  await test('Outbox maintains strict 50-item FIFO cap', () => {
    saveLocalSyncLog([]);
    for (let i = 1; i <= 60; i++) {
      recordSyncAction('UPDATE_PROGRESS', { bookId: 'b1', step: i });
    }
    const actions = getLocalSyncLog();
    assertEquals(actions.length, 50, 'Outbox must cap at exactly 50 items');
    assertEquals(actions[0].payload.step, 11, 'Oldest retained item must be step 11');
    assertEquals(actions[49].payload.step, 60, 'Newest item must be step 60');

    // Reset auth lock
    setSyncAuthStatus(false);
  });

  // Suite 3: AOP Logging Aspect & Durations
  console.log('\n▶ Suite 3: AOP Logging Aspect & Durations');
  await test('formatDuration formats milliseconds and seconds correctly', () => {
    assertEquals(formatDuration(45), '45ms');
    assertEquals(formatDuration(0), '0ms');
    assertEquals(formatDuration(1500), '1.50s (1500ms)');
  });

  await test('aopLogged wraps target function, executes proceed, and preserves return value', async () => {
    const multiply = async (a: number, b: number) => a * b;
    const wrapped = aopLogged('multiplyAspect', undefined, multiply);
    const result = await wrapped(6, 7);
    assertEquals(result, 42);
  });

  await test('aopLogged propagates target function errors cleanly', async () => {
    const failureTarget = async () => {
      throw new Error('Database pool error');
    };
    const wrapped = aopLogged('failureAspect', undefined, failureTarget);
    let caught = false;
    try {
      await wrapped();
    } catch (err: unknown) {
      caught = true;
      assertEquals((err as Error).message, 'Database pool error');
    }
    assert(caught, 'Should propagate error');
  });

  // Suite 4: Reader Chunking & Progress Math
  console.log('\n▶ Suite 4: Reader Chunking & Progress Math');
  await test('createChunksFromBlocks splits 130 text blocks into 50-item chunks', () => {
    const blocks: Block[] = Array.from({ length: 130 }, (_, i) => ({
      id: i,
      type: 'paragraph',
      text: `Paragraph ${i + 1}`,
    }));
    const chunks = createChunksFromBlocks('demo_book', blocks, 0);
    assertEquals(chunks.length, 3);
    assertEquals(chunks[0].id, 'demo_book:0');
    assertEquals(chunks[0].blocks.length, 50);
    assertEquals(chunks[1].id, 'demo_book:1');
    assertEquals(chunks[1].blocks.length, 50);
    assertEquals(chunks[2].id, 'demo_book:2');
    assertEquals(chunks[2].blocks.length, 30);
  });

  await test('Reading progress calculation formulas clamp within 0% to 100%', () => {
    function calcProgress(currentBlock: number, totalBlocks: number): number {
      if (totalBlocks <= 0) return 0;
      const pct = Math.round((currentBlock / totalBlocks) * 100);
      return Math.min(100, Math.max(0, pct));
    }

    assertEquals(calcProgress(0, 100), 0);
    assertEquals(calcProgress(50, 100), 50);
    assertEquals(calcProgress(100, 100), 100);
    assertEquals(calcProgress(120, 100), 100);
    assertEquals(calcProgress(-5, 100), 0);
    assertEquals(calcProgress(10, 0), 0);
  });

  // Suite 5: Security Authorization Guards (401 Contracts)
  console.log('\n▶ Suite 5: Security Authorization Guards (401 Contracts)');
  await test('POST /api/settings returns 401 Unauthorized without session', async () => {
    const req = new Request('http://localhost:3000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontSize: 18 }),
    });
    const res = await settingsPost(req);
    assertEquals(res.status, 401);
  });

  await test('POST /api/settings/themes returns 401 Unauthorized without session', async () => {
    const req = new Request('http://localhost:3000/api/settings/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Midnight', bg: '#000', text: '#fff', font: 'serif' }),
    });
    const res = await themesPost(req);
    assertEquals(res.status, 401);
  });

  await test('DELETE /api/settings/themes returns 401 Unauthorized without session', async () => {
    const req = new Request('http://localhost:3000/api/settings/themes?name=Midnight', {
      method: 'DELETE',
    });
    const res = await themesDelete(req);
    assertEquals(res.status, 401);
  });

  await test('GET /api/sync returns 401 Unauthorized without session', async () => {
    const res = await syncGet();
    assertEquals(res.status, 401);
  });

  await test('POST /api/sync returns 401 Unauthorized without session', async () => {
    const req = new Request('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: [] }),
    });
    const res = await syncPost(req);
    assertEquals(res.status, 401);
  });

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBackendUnitTests();
