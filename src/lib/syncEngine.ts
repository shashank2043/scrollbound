// Sync Engine: Maintains the last 50 steps taken in both local storage and cloud database.
// Provides precise execution timing (ms/seconds), detailed console logging,
// auto-retry with backoff (at least 3 attempts), foreground retry with progress tracking,
// terminal failure modal notification, and local rollback to match cloud.

export type SyncActionType =
  | 'UPDATE_PROGRESS'
  | 'ADD_BOOKMARK'
  | 'DELETE_BOOKMARK'
  | 'UPDATE_BOOKMARK_NOTE'
  | 'SAVE_SETTINGS'
  | 'SAVE_THEME'
  | 'DELETE_THEME'
  | 'DELETE_BOOK';

export interface SyncLogEntry {
  id: string; // unique action ID
  action: SyncActionType;
  payload: any;
  timestamp: number;
  durationMs?: number; // Time in milliseconds taken for the step
  status: 'pending' | 'synced' | 'failed';
  error?: string;
  retryCount: number;
}

export const SYNC_LOG_STORAGE_KEY = 'scrollbound_sync_log_v1';
export const MAX_SYNC_LOG_ENTRIES = 50;

/**
 * Terminal failure event subscription for UI modals
 */
type TerminalFailureListener = (entry: SyncLogEntry) => void;
const terminalFailureListeners = new Set<TerminalFailureListener>();

export function subscribeTerminalFailure(listener: TerminalFailureListener): () => void {
  terminalFailureListeners.add(listener);
  return () => {
    terminalFailureListeners.delete(listener);
  };
}

export function notifyTerminalFailure(entry: SyncLogEntry): void {
  for (const listener of Array.from(terminalFailureListeners)) {
    try {
      listener(entry);
    } catch (e) {
      console.error('Error in terminal failure listener:', e);
    }
  }
}

/**
 * Console Logger with timings in milliseconds or seconds
 */
export function logStep(
  action: string,
  status: 'start' | 'synced' | 'failed' | 'retry' | 'reconcile',
  durationMs?: number,
  details?: any
) {
  const timeStr = new Date().toLocaleTimeString();
  const durStr =
    durationMs !== undefined
      ? durationMs >= 1000
        ? `${(durationMs / 1000).toFixed(2)}s (${durationMs}ms)`
        : `${durationMs}ms`
      : '';

  if (status === 'start') {
    console.log(
      `%c[Scrollbound ${timeStr}] ⚡ ${action} started...`,
      'color: #3b82f6; font-weight: bold;',
      details !== undefined ? details : ''
    );
  } else if (status === 'synced') {
    console.log(
      `%c[Scrollbound ${timeStr}] ✅ ${action} completed & synced in ${durStr}`,
      'color: #10b981; font-weight: bold;',
      details !== undefined ? details : ''
    );
  } else if (status === 'failed') {
    console.warn(
      `%c[Scrollbound ${timeStr}] ❌ ${action} failed in ${durStr}`,
      'color: #ef4444; font-weight: bold;',
      details !== undefined ? details : ''
    );
  } else if (status === 'retry') {
    console.log(
      `%c[Scrollbound ${timeStr}] 🔁 ${action} retrying...`,
      'color: #f59e0b; font-weight: bold;',
      details !== undefined ? details : ''
    );
  } else if (status === 'reconcile') {
    console.log(
      `%c[Scrollbound ${timeStr}] 🔄 ${action} finished in ${durStr}`,
      'color: #8b5cf6; font-weight: bold;',
      details !== undefined ? details : ''
    );
  }
}

/**
 * Get the local sync log of the last 50 steps from localStorage
 */
export function getLocalSyncLog(): SyncLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save the sync log locally, ensuring exactly the last 50 entries are kept
 */
export function saveLocalSyncLog(log: SyncLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = log.slice(-MAX_SYNC_LOG_ENTRIES);
    localStorage.setItem(SYNC_LOG_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

/**
 * Record a new action in the local sync log
 */
export function recordSyncAction(
  action: SyncActionType,
  payload: any,
  status: 'pending' | 'synced' | 'failed' = 'pending',
  error?: string,
  durationMs?: number
): SyncLogEntry {
  const entry: SyncLogEntry = {
    id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    action,
    payload,
    timestamp: Date.now(),
    durationMs,
    status,
    error,
    retryCount: 0,
  };

  const current = getLocalSyncLog();
  current.push(entry);
  saveLocalSyncLog(current);

  return entry;
}

/**
 * Update status of an existing action in the local log.
 * If failed: automatically triggers up to 3 automatic retries with backoff!
 * If it has failed 3 times: triggers terminal failure modal!
 */
export function markSyncActionStatus(
  id: string,
  status: 'synced' | 'failed',
  error?: string,
  durationMs?: number
): void {
  const current = getLocalSyncLog();
  const index = current.findIndex((e) => e.id === id);
  if (index === -1) return;

  current[index].status = status;
  if (durationMs !== undefined) current[index].durationMs = durationMs;
  if (error) current[index].error = error;

  if (status === 'synced') {
    saveLocalSyncLog(current);
    return;
  }

  // Handle failure
  // If unauthorized / unauthenticated (HTTP 401), keep as pending locally without burning retries or showing failure modal
  if (error && (error.includes('401') || error.toLowerCase().includes('unauthorized'))) {
    current[index].status = 'pending';
    current[index].error = 'Waiting for login (Unauthenticated)';
    saveLocalSyncLog(current);
    return;
  }

  current[index].retryCount = (current[index].retryCount || 0) + 1;
  const updatedEntry = { ...current[index] };
  saveLocalSyncLog(current);

  const retryCount = updatedEntry.retryCount;

  // Auto-retry at least 3 tries automatically with staged backoff
  if (retryCount < 3) {
    const backoffDelays = [2000, 5000, 10000];
    const delay = backoffDelays[retryCount - 1] || 5000;

    logStep(
      `Auto-retry ${retryCount}/3 for [${updatedEntry.action}] in ${(delay / 1000).toFixed(0)}s`,
      'retry'
    );

    setTimeout(() => {
      retrySingleActionDirectly(updatedEntry.id);
    }, delay);
  } else {
    // Failed more than 3 times: trigger terminal failure modal!
    logStep(
      `[${updatedEntry.action}] failed 3 automatic retries. Showing user resolution modal`,
      'failed',
      durationMs,
      error
    );
    notifyTerminalFailure(updatedEntry);
  }
}

/**
 * Retry a single action directly in the background (used by the 3 automatic tries)
 */
async function retrySingleActionDirectly(actionId: string): Promise<boolean> {
  const current = getLocalSyncLog();
  const entry = current.find((e) => e.id === actionId);
  if (!entry || entry.status === 'synced') return true;

  const t0 = performance.now();
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: [entry] }),
      keepalive: true,
    });

    const elapsed = Math.round(performance.now() - t0);

    if (res.ok) {
      markSyncActionStatus(entry.id, 'synced', undefined, elapsed);
      logStep(`Auto-retry attempt succeeded for [${entry.action}]`, 'synced', elapsed);
      return true;
    } else if (res.status === 401) {
      entry.status = 'pending';
      entry.error = 'Waiting for login (Unauthenticated)';
      saveLocalSyncLog(current);
      return false;
    } else {
      markSyncActionStatus(entry.id, 'failed', `HTTP ${res.status}`, elapsed);
      return false;
    }
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    markSyncActionStatus(entry.id, 'failed', msg, elapsed);
    return false;
  }
}

/**
 * Foreground Retry: executed when user clicks "Retry in Foreground"
 * Reports progress (stage and percentage) for visual feedback
 */
export async function retryActionInForeground(
  actionId: string,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<{ success: boolean; error?: string }> {
  const current = getLocalSyncLog();
  const entry = current.find((e) => e.id === actionId);
  if (!entry) {
    return { success: false, error: 'Action not found in log.' };
  }

  onProgress?.({ stage: 'Connecting to cloud database...', percent: 20 });
  const t0 = performance.now();

  try {
    onProgress?.({ stage: 'Uploading step data to cloud...', percent: 60 });

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: [entry] }),
      keepalive: true,
    });

    const elapsed = Math.round(performance.now() - t0);

    if (res.ok) {
      onProgress?.({ stage: 'Synchronized successfully!', percent: 100 });
      markSyncActionStatus(entry.id, 'synced', undefined, elapsed);
      logStep(`Foreground retry completed for [${entry.action}]`, 'synced', elapsed);
      return { success: true };
    } else if (res.status === 401) {
      const errorMsg = 'Please log in to synchronize your local actions with the cloud.';
      entry.status = 'pending';
      entry.error = 'Waiting for login (Unauthenticated)';
      saveLocalSyncLog(getLocalSyncLog());
      logStep(`Foreground retry skipped for [${entry.action}] (Unauthenticated)`, 'retry');
      return { success: false, error: errorMsg };
    } else {
      const errorMsg = `Server returned HTTP ${res.status}`;
      markSyncActionStatus(entry.id, 'failed', errorMsg, elapsed);
      logStep(`Foreground retry failed for [${entry.action}]`, 'failed', elapsed, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    markSyncActionStatus(entry.id, 'failed', msg, elapsed);
    logStep(`Foreground retry error for [${entry.action}]`, 'failed', elapsed, msg);
    return { success: false, error: msg };
  }
}

/**
 * Discard Local Copy & Align with Cloud:
 * Reverts the unsynced local modification and removes it from the outbox log.
 */
export async function rollbackLocalAction(actionId: string): Promise<void> {
  const current = getLocalSyncLog();
  const entry = current.find((e) => e.id === actionId);
  if (!entry) return;

  const { action, payload } = entry;
  logStep(`Rolling back local copy for [${action}] to align with cloud`, 'start');

  try {
    switch (action) {
      case 'UPDATE_PROGRESS': {
        if (payload?.bookId) {
          // Fetch cloud progress or remove local progress override
          const res = await fetch(`/api/books/${payload.bookId}/progress`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) {
              localStorage.setItem(
                `scrollbound_progress_${payload.bookId}`,
                JSON.stringify(data.progress)
              );
            } else {
              localStorage.removeItem(`scrollbound_progress_${payload.bookId}`);
            }
          }
        }
        break;
      }

      case 'ADD_BOOKMARK': {
        if (payload?.bookId && payload?.id) {
          const raw = localStorage.getItem(`scrollbound_bookmarks_${payload.bookId}`);
          if (raw) {
            const bms = JSON.parse(raw);
            const filtered = bms.filter((b: any) => b.id !== payload.id);
            localStorage.setItem(
              `scrollbound_bookmarks_${payload.bookId}`,
              JSON.stringify(filtered)
            );
          }
        }
        break;
      }

      case 'DELETE_BOOKMARK':
      case 'UPDATE_BOOKMARK_NOTE': {
        if (payload?.bookId) {
          const res = await fetch(`/api/books/${payload.bookId}/bookmarks`);
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem(
              `scrollbound_bookmarks_${payload.bookId}`,
              JSON.stringify(data.bookmarks || [])
            );
          }
        }
        break;
      }

      case 'SAVE_SETTINGS': {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            localStorage.setItem(
              'scrollbound_reader_settings',
              JSON.stringify(data.settings)
            );
          }
        }
        break;
      }

      case 'SAVE_THEME': {
        if (payload?.id) {
          const raw = localStorage.getItem('scrollbound_custom_themes');
          if (raw) {
            const themes = JSON.parse(raw);
            const filtered = themes.filter((t: any) => t.id !== payload.id);
            localStorage.setItem('scrollbound_custom_themes', JSON.stringify(filtered));
          }
        }
        break;
      }

      case 'DELETE_THEME': {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.customThemes)) {
            localStorage.setItem(
              'scrollbound_custom_themes',
              JSON.stringify(data.customThemes)
            );
          }
        }
        break;
      }

      case 'DELETE_BOOK': {
        const res = await fetch('/api/books');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.books)) {
            localStorage.setItem('scrollbound_cached_books', JSON.stringify(data.books));
          }
        }
        break;
      }
    }
  } catch (err) {
    console.warn('Rollback fetch error:', err);
  }

  // Remove the action from local sync log
  const updatedLog = current.filter((e) => e.id !== actionId);
  saveLocalSyncLog(updatedLog);

  // Notify any active page components to refresh their state
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('scrollbound_rollback', {
          detail: { action, payload },
        })
      );
    } catch {}
  }

  logStep(`Local rollback completed for [${action}]`, 'synced');
}

/**
 * Get all actions that are currently pending or failed (need cloud sync)
 */
export function getPendingSyncActions(): SyncLogEntry[] {
  return getLocalSyncLog().filter((e) => e.status === 'pending' || e.status === 'failed');
}

/**
 * Flush all pending actions to the cloud API /api/sync
 */
let isSyncing = false;

export async function flushPendingSyncQueue(): Promise<{
  syncedCount: number;
  remainingPending: number;
}> {
  if (isSyncing || typeof window === 'undefined') {
    return { syncedCount: 0, remainingPending: getPendingSyncActions().length };
  }

  const pending = getPendingSyncActions();
  if (pending.length === 0) {
    return { syncedCount: 0, remainingPending: 0 };
  }

  const startTime = performance.now();
  logStep(`Flushing ${pending.length} pending action(s)`, 'start');

  isSyncing = true;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: pending }),
      keepalive: true,
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json();
      const current = getLocalSyncLog();
      const flushedIds = new Set(pending.map((p) => p.id));
      for (const entry of current) {
        if (flushedIds.has(entry.id)) {
          entry.status = 'synced';
          entry.durationMs = elapsed;
          entry.error = undefined;
        }
      }
      saveLocalSyncLog(current);

      logStep(`Flushed ${pending.length} pending action(s)`, 'synced', elapsed, {
        processedByCloud: data.processed,
      });

      return {
        syncedCount: pending.length,
        remainingPending: 0,
      };
    } else if (res.status === 401) {
      const current = getLocalSyncLog();
      const pendingIds = new Set(pending.map((p) => p.id));
      for (const entry of current) {
        if (pendingIds.has(entry.id)) {
          entry.status = 'pending';
          entry.error = 'Waiting for login (Unauthenticated)';
        }
      }
      saveLocalSyncLog(current);
      logStep('Pending actions kept locally (User not logged in)', 'reconcile');
      return { syncedCount: 0, remainingPending: pending.length };
    } else {
      for (const p of pending) {
        markSyncActionStatus(p.id, 'failed', `HTTP ${res.status}`, elapsed);
      }
      logStep(`Flushing ${pending.length} pending action(s)`, 'failed', elapsed, {
        status: res.status,
      });
    }
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - startTime);
    const msg = err instanceof Error ? err.message : String(err);
    for (const p of pending) {
      markSyncActionStatus(p.id, 'failed', msg, elapsed);
    }
    logStep(`Flushing ${pending.length} pending action(s)`, 'failed', elapsed, msg);
  } finally {
    isSyncing = false;
  }

  return { syncedCount: 0, remainingPending: getPendingSyncActions().length };
}

/**
 * Fetch the cloud's last 50 steps sync log
 */
export async function fetchCloudSyncLog(): Promise<SyncLogEntry[]> {
  try {
    const res = await fetch('/api/sync');
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.syncLog) ? data.syncLog : [];
    }
  } catch {}
  return [];
}

/**
 * Background Reconciliation:
 * Compares local sync log with cloud sync log every 5 minutes (or configured interval).
 */
export async function reconcileWithCloud(): Promise<void> {
  if (typeof window === 'undefined') return;

  const startReconcile = performance.now();
  logStep('Cloud Reconciliation (Periodic check)', 'start');

  try {
    // 1. If we have pending or failed actions, retry uploading them first
    const pending = getPendingSyncActions();
    if (pending.length > 0) {
      logStep(`Found ${pending.length} pending/failed action(s) to retry`, 'retry');
      await flushPendingSyncQueue();
    }

    // 2. Compare local log with cloud log
    const cloudLog = await fetchCloudSyncLog();
    const localLog = getLocalSyncLog();

    const cloudIdMap = new Map(cloudLog.map((c) => [c.id, c]));
    let repairedCount = 0;

    for (const entry of localLog) {
      const cloudMatch = cloudIdMap.get(entry.id);
      if (cloudMatch && cloudMatch.status === 'synced' && entry.status !== 'synced') {
        entry.status = 'synced';
        entry.error = undefined;
        repairedCount++;
      }
    }

    if (repairedCount > 0) {
      saveLocalSyncLog(localLog);
    }

    const elapsed = Math.round(performance.now() - startReconcile);
    logStep(
      'Cloud Reconciliation',
      'reconcile',
      elapsed,
      `Local: ${localLog.length} steps, Cloud: ${cloudLog.length} steps, Repaired: ${repairedCount}`
    );
  } catch (err) {
    const elapsed = Math.round(performance.now() - startReconcile);
    logStep('Cloud Reconciliation', 'failed', elapsed, err);
  }
}

let isInitialized = false;
let autoSyncIntervalTimer: NodeJS.Timeout | null = null;
let currentAutoSyncEnabled = true;
let currentAutoSyncIntervalMinutes = 5; // Default 5 minutes

/**
 * Configure auto background sync interval or disable it completely.
 * Note: Automatic retries for failed uploads (the 3 tries) are independent
 * and NEVER disabled by this setting.
 */
export function setAutoSyncConfig(enabled = true, intervalMinutes = 5): void {
  currentAutoSyncEnabled = enabled;
  currentAutoSyncIntervalMinutes = Math.max(1, intervalMinutes);

  if (autoSyncIntervalTimer) {
    clearInterval(autoSyncIntervalTimer);
    autoSyncIntervalTimer = null;
  }

  if (currentAutoSyncEnabled && typeof window !== 'undefined') {
    const intervalMs = currentAutoSyncIntervalMinutes * 60 * 1000;
    autoSyncIntervalTimer = setInterval(() => {
      reconcileWithCloud();
    }, intervalMs);

    console.log(
      `%c[Scrollbound Sync Engine] ⏱️ Auto-sync scheduled every ${currentAutoSyncIntervalMinutes} minute(s)`,
      'color: #06b6d4; font-weight: bold;'
    );
  } else {
    console.log(
      '%c[Scrollbound Sync Engine] ⏸️ Periodic background auto-sync paused (3-try auto-retry on upload failure remains active)',
      'color: #f59e0b; font-weight: bold;'
    );
  }
}

export function initSyncEngine(initialConfig?: {
  autoSyncEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
}): void {
  if (isInitialized || typeof window === 'undefined') {
    if (initialConfig) {
      setAutoSyncConfig(
        initialConfig.autoSyncEnabled ?? currentAutoSyncEnabled,
        initialConfig.autoSyncIntervalMinutes ?? currentAutoSyncIntervalMinutes
      );
    }
    return;
  }
  isInitialized = true;

  let initialEnabled = true;
  let initialMinutes = 5;
  try {
    const raw = localStorage.getItem('scrollbound_reader_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.autoSyncEnabled === 'boolean') {
        initialEnabled = parsed.autoSyncEnabled;
      }
      if (typeof parsed.autoSyncIntervalMinutes === 'number') {
        initialMinutes = parsed.autoSyncIntervalMinutes;
      }
    }
  } catch {}

  if (initialConfig) {
    if (typeof initialConfig.autoSyncEnabled === 'boolean') {
      initialEnabled = initialConfig.autoSyncEnabled;
    }
    if (typeof initialConfig.autoSyncIntervalMinutes === 'number') {
      initialMinutes = initialConfig.autoSyncIntervalMinutes;
    }
  }

  console.log(
    `%c[Scrollbound Sync Engine] Initialized (Default: ${initialMinutes}m interval, Enabled: ${initialEnabled})`,
    'color: #06b6d4; font-weight: bold;'
  );

  // Initial immediate reconciliation
  reconcileWithCloud();

  // Listen to network changes
  window.addEventListener('online', () => {
    logStep('Network restored (online)', 'retry');
    reconcileWithCloud();
  });

  // Listen to window visibility / tab focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentAutoSyncEnabled) {
      reconcileWithCloud();
    }
  });

  // Configure auto sync interval timer
  setAutoSyncConfig(initialEnabled, initialMinutes);
}
