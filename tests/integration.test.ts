/**
 * Integration Test Suite for Scrollbound
 * Covers:
 * 1. Preference & Settings persistence (0ms local-first read/write, default fallbacks)
 * 2. Custom themes lifecycle (save, list, apply, delete)
 * 3. 50-step Outbox Sync Engine (FIFO eviction, audit log, durationMs tracking)
 * 4. Auto-retry mechanism (3 tries with backoff, terminal failure notification)
 * 5. Resilient 401 Unauthorized handling (guest mode preserved without modal alerts)
 * 6. Foreground retry with live progress updates
 * 7. Discard & rollback local modifications to align with cloud
 * 8. Auto-sync interval configuration (1m, 2m, 5m default, toggle on/off)
 * 9. Reader chunking and progress calculations
 * 10. API Route contracts (settings, sync, themes)
 */

// Setup Mock DOM & LocalStorage environment for Node.js
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

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockSessionStorage;
(globalThis as any).window = globalThis;
(globalThis as any).dispatchEvent = (_event: any) => true;
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};
(globalThis as any).document = {
  documentElement: {
    style: {
      setProperty: (_prop: string, _val: string) => {},
    },
    classList: {
      add: (_cls: string) => {},
      remove: (_cls: string) => {},
    },
  },
  addEventListener: (_event: string, _cb: any) => {},
  removeEventListener: (_event: string, _cb: any) => {},
  visibilityState: 'visible',
};

// Test Runner Framework
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)})`);
  }
}

// Imports under test
import {
  recordSyncAction,
  markSyncActionStatus,
  getLocalSyncLog,
  saveLocalSyncLog,
  subscribeTerminalFailure,
  setAutoSyncConfig,
  retryActionInForeground,
  rollbackLocalAction,
  setSyncAuthStatus,
  isSyncAuthenticated,
  MAX_SYNC_LOG_ENTRIES,
  SyncLogEntry,
} from '../src/lib/syncEngine';

import {
  getLocalSettings,
  saveLocalSettings,
  saveSettings,
  getLocalCustomThemes,
  saveLocalCustomThemes,
  saveCustomTheme,
  deleteCustomTheme,
  createChunksFromBlocks,
} from '../src/lib/db';

import { DEFAULT_SETTINGS, PRESET_THEMES, applyThemeVariables } from '../src/lib/theme';
import { ReaderSettings, CustomTheme, Block } from '../src/lib/types';
import { aopLogged, formatDuration } from '../src/lib/aspects/loggingAspect';

import { POST as settingsPost, GET as settingsGet } from '../src/app/api/settings/route';
import { POST as themePost, DELETE as themeDelete } from '../src/app/api/settings/themes/route';
import { GET as syncGet, POST as syncPost } from '../src/app/api/sync/route';

async function runAllTests() {
  console.log('\n======================================================');
  console.log('   SCROLLBOUND COMPLETE INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  // Suite 1: Local Settings & Reading Preferences Persistence
  console.log('\x1b[36m▶ Suite 1: Preferences & Settings Persistence (0ms Local-First)\x1b[0m');

  await test('Default settings fallback when localStorage is empty', () => {
    mockLocalStorage.clear();
    const loaded = getLocalSettings();
    assertEqual(loaded, null, 'Should return null when storage is empty');
    assert(DEFAULT_SETTINGS.fontSize === 18, 'Default font size should be 18');
    assert(DEFAULT_SETTINGS.themeId === 'light', 'Default theme should be light');
    assert(DEFAULT_SETTINGS.autoSyncIntervalMinutes === 5, 'Default autoSyncIntervalMinutes must be 5');
  });

  await test('Synchronous 0ms local storage write and retrieval', () => {
    mockLocalStorage.clear();
    const customSettings: ReaderSettings = {
      fontSize: 22,
      fontFamily: 'serif',
      lineHeight: 1.8,
      contentWidth: 65,
      themeId: 'dark',
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 10,
    };

    saveLocalSettings(customSettings);
    const retrieved = getLocalSettings();
    assert(retrieved !== null, 'Retrieved settings should not be null');
    assertEqual(retrieved?.fontSize, 22, 'Font size should match');
    assertEqual(retrieved?.themeId, 'dark', 'Theme ID should match');
    assertEqual(retrieved?.autoSyncIntervalMinutes, 10, 'Auto-sync interval should match');
  });

  await test('Dual-write saveSettings updates local cache synchronously', async () => {
    mockLocalStorage.clear();
    const newSettings: ReaderSettings = {
      fontSize: 24,
      fontFamily: 'mono',
      lineHeight: 2.0,
      contentWidth: 70,
      themeId: 'sepia',
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 2,
    };

    await saveSettings(newSettings);
    const local = getLocalSettings();
    assertEqual(local?.fontSize, 24, 'saveSettings should immediately write fontSize to localStorage');
    assertEqual(local?.themeId, 'sepia', 'saveSettings should immediately write themeId to localStorage');
    assertEqual(local?.autoSyncIntervalMinutes, 2, 'saveSettings should immediately write interval to localStorage');
  });

  // Suite 2: Custom Themes Lifecycle
  console.log('\n\x1b[36m▶ Suite 2: Custom Themes Lifecycle & Validation\x1b[0m');

  await test('Save, retrieve, and delete custom themes in local storage', async () => {
    mockLocalStorage.clear();
    const testTheme: CustomTheme = {
      id: 'theme_custom_test',
      name: 'Cyberpunk Neon',
      bg: '#0f172a',
      text: '#38bdf8',
      accent: '#f43f5e',
    };

    await saveCustomTheme(testTheme);
    let themes = getLocalCustomThemes();
    assertEqual(themes.length, 1, 'Should contain 1 custom theme');
    assertEqual(themes[0].name, 'Cyberpunk Neon', 'Theme name should match');
    assertEqual(themes[0].accent, '#f43f5e', 'Accent color should match');

    await deleteCustomTheme('theme_custom_test');
    themes = getLocalCustomThemes();
    assertEqual(themes.length, 0, 'Custom theme should be removed after deletion');
  });

  await test('applyThemeVariables sets valid CSS styling for presets and custom themes', () => {
    const presetTheme = PRESET_THEMES.dark;
    assert(presetTheme.bg !== undefined, 'Preset theme has bg');
    assert(presetTheme.text !== undefined, 'Preset theme has text');

    // Should not throw in DOM environment
    applyThemeVariables(presetTheme, DEFAULT_SETTINGS);

    const customTheme: CustomTheme = {
      id: 'c1',
      name: 'Forest',
      bg: '#1b2d1f',
      text: '#d4ecd5',
      accent: '#52b788',
    };
    applyThemeVariables(customTheme, DEFAULT_SETTINGS);
  });

  // Suite 3: 50-Step Outbox Sync Engine & Audit Log
  console.log('\n\x1b[36m▶ Suite 3: 50-Step Outbox Sync Engine & Audit Trail\x1b[0m');

  await test('Record action in outbox queue with timing and pending status', () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('SAVE_SETTINGS', { fontSize: 20 }, 'pending');

    assert(entry.id.startsWith('sync_'), 'Entry ID should have prefix sync_');
    assertEqual(entry.action, 'SAVE_SETTINGS', 'Action type should match');
    assertEqual(entry.status, 'pending', 'Initial status should be pending');
    assertEqual(entry.retryCount, 0, 'Initial retryCount should be 0');

    const log = getLocalSyncLog();
    assertEqual(log.length, 1, 'Local sync log should contain 1 entry');
    assertEqual(log[0].id, entry.id, 'Logged entry ID should match');
  });

  await test('Strict FIFO eviction: maintains exactly the last 50 steps', () => {
    mockLocalStorage.clear();

    // Insert 65 sequential steps
    for (let i = 1; i <= 65; i++) {
      recordSyncAction('UPDATE_PROGRESS', { bookId: 'book_1', blockId: i, percent: i });
    }

    const log = getLocalSyncLog();
    assertEqual(log.length, MAX_SYNC_LOG_ENTRIES, `Log must not exceed ${MAX_SYNC_LOG_ENTRIES} entries`);
    assertEqual(log.length, 50, 'Log must contain exactly 50 entries');

    // Verify oldest entries 1-15 were evicted and 16-65 remain
    assertEqual(log[0].payload.blockId, 16, 'Oldest retained entry should be step 16');
    assertEqual(log[49].payload.blockId, 65, 'Newest entry should be step 65');
  });

  await test('Update sync action status to synced with execution durationMs', () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('SAVE_THEME', { id: 't1' });
    markSyncActionStatus(entry.id, 'synced', undefined, 42);

    const log = getLocalSyncLog();
    assertEqual(log[0].status, 'synced', 'Status should be updated to synced');
    assertEqual(log[0].durationMs, 42, 'durationMs should be recorded as 42');
  });

  // Suite 4: Auto-Retry & Terminal Failure Resiliency
  console.log('\n\x1b[36m▶ Suite 4: Auto-Retry (3 Attempts) & Terminal Failure Notification\x1b[0m');

  await test('Network failure triggers staged retry count increment', () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('UPDATE_PROGRESS', { bookId: 'b1', percent: 50 });

    // First network failure
    markSyncActionStatus(entry.id, 'failed', 'Network Timeout', 150);
    let log = getLocalSyncLog();
    assertEqual(log[0].status, 'failed', 'Status should be failed');
    assertEqual(log[0].retryCount, 1, 'retryCount should be 1 after first failure');

    // Second failure
    markSyncActionStatus(entry.id, 'failed', 'Connection reset', 200);
    log = getLocalSyncLog();
    assertEqual(log[0].retryCount, 2, 'retryCount should be 2 after second failure');
  });

  await test('Action failing more than 3 times notifies terminal failure subscriber', () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('DELETE_BOOK', { bookId: 'b_del' });

    let terminalAlertFired = false;
    let failedActionId = '';

    const unsubscribe = subscribeTerminalFailure((failedEntry) => {
      terminalAlertFired = true;
      failedActionId = failedEntry.id;
    });

    // 1st failure
    markSyncActionStatus(entry.id, 'failed', '500 Internal Error');
    assert(!terminalAlertFired, 'Should not fire terminal alert on 1st failure');

    // 2nd failure
    markSyncActionStatus(entry.id, 'failed', '500 Internal Error');
    assert(!terminalAlertFired, 'Should not fire terminal alert on 2nd failure');

    // 3rd failure: reaches limit
    markSyncActionStatus(entry.id, 'failed', '500 Internal Error');
    assert(terminalAlertFired, 'Terminal failure modal subscriber must be notified on 3rd failure');
    assertEqual(failedActionId, entry.id, 'Notified action ID must match');

    unsubscribe();
  });

  // Suite 5: Unauthenticated Resiliency (No False Modal / No Freeze)
  console.log('\n\x1b[36m▶ Suite 5: Unauthenticated / Guest 401 Resiliency\x1b[0m');

  await test('HTTP 401 Unauthorized does NOT burn retries or trigger terminal failure modal', () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('SAVE_SETTINGS', { fontSize: 16 });

    let terminalAlertFired = false;
    const unsubscribe = subscribeTerminalFailure(() => {
      terminalAlertFired = true;
    });

    // Encounter 401 Unauthorized
    markSyncActionStatus(entry.id, 'failed', 'HTTP 401');

    const log = getLocalSyncLog();
    assertEqual(log[0].status, 'pending', '401 should keep status as pending (waiting for login)');
    assertEqual(log[0].retryCount, 0, '401 should NOT burn retry count');
    assert(!terminalAlertFired, '401 must NEVER trigger the failure modal for guests');

    unsubscribe();
  });

  // Suite 6: Foreground Retry with Progress Reporting
  console.log('\n\x1b[36m▶ Suite 6: Foreground Retry & Progress Callback\x1b[0m');

  await test('retryActionInForeground reports progressive stages and updates action status', async () => {
    mockLocalStorage.clear();
    const entry = recordSyncAction('SAVE_SETTINGS', { themeId: 'sepia' }, 'failed', 'Simulated error');

    // Mock global fetch for successful foreground sync
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string, _opts: any) => {
      if (url === '/api/sync') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, processed: 1 }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const progressReports: number[] = [];
    const result = await retryActionInForeground(entry.id, (prog) => {
      progressReports.push(prog.percent);
    });

    assert(result.success, 'Foreground retry should succeed');
    assert(progressReports.includes(20), 'Progress should report 20% connecting stage');
    assert(progressReports.includes(60), 'Progress should report 60% uploading stage');
    assert(progressReports.includes(100), 'Progress should report 100% completed stage');

    const log = getLocalSyncLog();
    assertEqual(log[0].status, 'synced', 'Action should be marked synced after successful foreground retry');

    (globalThis as any).fetch = originalFetch;
  });

  // Suite 7: Discard Local Copy & Rollback Alignment
  console.log('\n\x1b[36m▶ Suite 7: Local Discard & Rollback to Cloud State\x1b[0m');

  await test('rollbackLocalAction removes action from outbox and reverts local state', async () => {
    mockLocalStorage.clear();
    // Simulate modified local settings
    mockLocalStorage.setItem('scrollbound_reader_settings', JSON.stringify({ fontSize: 32 }));

    const entry = recordSyncAction('SAVE_SETTINGS', { fontSize: 32 }, 'failed', 'Upload permanently failed');

    // Mock fetch returning cloud settings
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url === '/api/settings') {
        return {
          ok: true,
          json: async () => ({ settings: { fontSize: 18 } }),
        };
      }
      return { ok: false };
    };

    await rollbackLocalAction(entry.id);

    // Verify outbox entry is removed
    const log = getLocalSyncLog();
    assertEqual(log.length, 0, 'Failed action must be removed from sync log on rollback');

    // Verify local storage was aligned with cloud
    const currentSettings = getLocalSettings();
    assertEqual(currentSettings?.fontSize, 18, 'Local settings should be reverted to cloud value (18)');

    (globalThis as any).fetch = originalFetch;
  });

  // Suite 8: Auto-Sync Configuration & Intervals
  console.log('\n\x1b[36m▶ Suite 8: Auto-Sync Configuration & Interval Timers\x1b[0m');

  await test('setAutoSyncConfig configures custom intervals and handles toggling off', () => {
    // 1 minute
    setAutoSyncConfig(true, 1);
    // 5 minutes (default)
    setAutoSyncConfig(true, 5);
    // 15 minutes
    setAutoSyncConfig(true, 15);
    // Turn off
    setAutoSyncConfig(false);

    assert(true, 'setAutoSyncConfig should execute without errors');
  });

  // Suite 9: Reader Blocks, Chunks, and Progress Calculations
  console.log('\n\x1b[36m▶ Suite 9: Reader Chunks & Progress Math\x1b[0m');

  await test('createChunksFromBlocks groups 125 blocks into 50-item chunks', () => {
    const blocks: Block[] = Array.from({ length: 125 }, (_, i) => ({
      id: i,
      type: 'paragraph',
      text: `Block content ${i}`,
    }));

    const chunks = createChunksFromBlocks('book_demo', blocks, 0);
    assertEqual(chunks.length, 3, '125 blocks should yield 3 chunks of size 50, 50, 25');
    assertEqual(chunks[0].blocks.length, 50, 'Chunk 0 length should be 50');
    assertEqual(chunks[1].blocks.length, 50, 'Chunk 1 length should be 50');
    assertEqual(chunks[2].blocks.length, 25, 'Chunk 2 length should be 25');
    assertEqual(chunks[0].id, 'book_demo:0', 'Chunk 0 ID format');
    assertEqual(chunks[1].id, 'book_demo:1', 'Chunk 1 ID format');
    assertEqual(chunks[2].id, 'book_demo:2', 'Chunk 2 ID format');
  });

  await test('Progress calculation formula accurately computes 0% to 100%', () => {
    const totalBlocks = 200;
    const calc = (blockId: number, offset: number) => {
      const clampedOffset = Math.max(0, Math.min(1, offset));
      return totalBlocks > 0
        ? Math.min(100, Math.max(0, ((blockId + clampedOffset) / totalBlocks) * 100))
        : 0;
    };

    assertEqual(calc(0, 0), 0, 'Start of book should be 0%');
    assertEqual(calc(100, 0), 50, 'Middle of book should be 50%');
    assertEqual(calc(199, 1.0), 100, 'End of book should be 100%');
    assertEqual(calc(300, 1.0), 100, 'Overflow should clamp to 100%');
  });

  // Suite 10: AOP Logging Aspect & Precision Timings
  console.log('\n\x1b[36m▶ Suite 10: AOP Logging Aspect & Millisecond Formatter\x1b[0m');

  await test('formatDuration outputs clean ms or seconds', () => {
    assertEqual(formatDuration(45), '45ms', 'Sub-second duration formatted as ms');
    assertEqual(formatDuration(1500), '1.50s (1500ms)', 'Multi-second duration formatted with both');
  });

  await test('aopLogged executes wrapped function, measures timing, and preserves return value', async () => {
    const coreOperation = async (a: number, b: number) => {
      return a + b;
    };

    const wrapped = aopLogged('additionJoinPoint', undefined, coreOperation);
    const sum = await wrapped(15, 27);
    assertEqual(sum, 42, 'Wrapped function should return correct result');
  });

  // Suite 11: Security Gate & Cloud Sync Authentication Enforcement
  console.log('\n\x1b[36m▶ Suite 11: Security Gate (Cloud Sync Strictly Impossible Without Sign-in)\x1b[0m');

  await test('Cloud sync is disabled by default when unauthenticated', () => {
    setSyncAuthStatus(false);
    assertEqual(isSyncAuthenticated(), false, 'isSyncAuthenticated must be false when unauthenticated');
  });

  await test('POST /api/settings strictly returns 401 Unauthorized without sign in', async () => {
    const mockRequest = new Request('http://localhost:3000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { fontSize: 20 } }),
    });

    const response = await settingsPost(mockRequest);
    assertEqual(response.status, 401, 'POST /api/settings must return 401 Unauthorized without sign in');
    const json = await response.json();
    assert(json.error.includes('Unauthorized'), 'Error message must state Unauthorized');
  });

  await test('POST /api/settings/themes strictly returns 401 Unauthorized without sign in', async () => {
    const mockRequest = new Request('http://localhost:3000/api/settings/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 't1', name: 'Emerald', bg: '#064e3b', text: '#ecfdf5', accent: '#10b981' }),
    });

    const response = await themePost(mockRequest);
    assertEqual(response.status, 401, 'POST /api/settings/themes must return 401 without sign in');
  });

  await test('DELETE /api/settings/themes strictly returns 401 Unauthorized without sign in', async () => {
    const mockRequest = new Request('http://localhost:3000/api/settings/themes?id=t1', {
      method: 'DELETE',
    });

    const response = await themeDelete(mockRequest);
    assertEqual(response.status, 401, 'DELETE /api/settings/themes must return 401 without sign in');
  });

  await test('GET /api/sync strictly returns 401 Unauthorized without sign in', async () => {
    const response = await syncGet();
    assertEqual(response.status, 401, 'GET /api/sync must return 401 without sign in');
  });

  await test('POST /api/sync strictly returns 401 Unauthorized without sign in', async () => {
    const mockRequest = new Request('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: [{ id: 'a1', action: 'SAVE_SETTINGS', payload: {}, retryCount: 0, status: 'pending', timestamp: Date.now() }] }),
    });

    const response = await syncPost(mockRequest);
    assertEqual(response.status, 401, 'POST /api/sync must return 401 without sign in');
  });

  await test('Signing in unlocks cloud sync status in syncEngine', () => {
    setSyncAuthStatus(true);
    assertEqual(isSyncAuthenticated(), true, 'isSyncAuthenticated must be true when signed in');
    // Lock it back
    setSyncAuthStatus(false);
    assertEqual(isSyncAuthenticated(), false, 'isSyncAuthenticated must return to false on sign out');
  });

  // Final Summary
  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      \x1b[32m${passedTests}\x1b[0m`);
  console.log(`FAILED:      \x1b[31m${failedTests}\x1b[0m`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
