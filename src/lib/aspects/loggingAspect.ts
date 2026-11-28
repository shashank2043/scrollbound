// Aspect-Oriented Programming (AOP) Logging & Sync Aspect
// Similar to Spring AOP @Around in Java, this completely separates cross-cutting
// concerns (timing, console logging, error catching, and cloud sync log persistence)
// from the core business logic.

import {
  SyncActionType,
  recordSyncAction,
  markSyncActionStatus,
  isSyncAuthenticated,
} from '../syncEngine';

export interface AspectJoinPoint<TArgs extends any[], TReturn> {
  name: string;
  actionType?: SyncActionType;
  args: TArgs;
  proceed: () => Promise<TReturn>;
}

export type AroundAdvice<TArgs extends any[], TReturn> = (
  joinPoint: AspectJoinPoint<TArgs, TReturn>
) => Promise<TReturn>;

/**
 * Format milliseconds into human-readable ms or seconds
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s (${ms}ms)`;
  }
  return `${ms}ms`;
}

/**
 * AOP Around-Advice for Operations:
 * 1. Before advice: starts high-precision performance timer, logs start to console
 * 2. Proceed: executes the pure business logic without any logging pollution
 * 3. After-Returning advice: records duration, logs success in green, writes to sync log
 * 4. After-Throwing advice: logs failure in red with duration, records failure in sync log for auto-retry
 */
export function aopLogged<TArgs extends any[], TReturn>(
  name: string,
  actionType: SyncActionType | undefined,
  targetFn: (...args: TArgs) => Promise<TReturn>,
  getPayload?: (...args: TArgs) => any
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const timeStr = new Date().toLocaleTimeString();
    const startTime = performance.now();

    // 1. Before JoinPoint
    console.log(
      `%c[Scrollbound AOP ${timeStr}] ⚡ [${name}] started`,
      'color: #3b82f6; font-weight: bold; background: rgba(59, 130, 246, 0.1); padding: 2px 6px; rounded: 4px;'
    );

    let syncEntryId: string | undefined;
    if (actionType) {
      const payload = getPayload ? getPayload(...args) : args[0];
      const entry = recordSyncAction(actionType, payload, 'pending');
      syncEntryId = entry.id;
    }

    try {
      // 2. Target Execution (Pure Business Logic)
      const result = await targetFn(...args);

      // 3. After-Returning JoinPoint
      const durationMs = Math.round(performance.now() - startTime);
      const formatted = formatDuration(durationMs);

      console.log(
        `%c[Scrollbound AOP ${new Date().toLocaleTimeString()}] ✅ [${name}] completed in ${formatted}`,
        'color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); padding: 2px 6px; rounded: 4px;'
      );

      if (syncEntryId) {
        markSyncActionStatus(syncEntryId, 'synced', undefined, durationMs);
      }

      return result;
    } catch (err: unknown) {
      // 4. After-Throwing JoinPoint
      const durationMs = Math.round(performance.now() - startTime);
      const formatted = formatDuration(durationMs);
      const errMsg = err instanceof Error ? err.message : String(err);

      console.warn(
        `%c[Scrollbound AOP ${new Date().toLocaleTimeString()}] ❌ [${name}] failed after ${formatted}: ${errMsg}`,
        'color: #ef4444; font-weight: bold; background: rgba(239, 68, 68, 0.1); padding: 2px 6px; rounded: 4px;'
      );

      if (syncEntryId) {
        markSyncActionStatus(syncEntryId, 'failed', errMsg, durationMs);
      }

      throw err;
    }
  };
}

/**
 * AOP Non-blocking background aspect:
 * Runs the cloud sync operation completely detached in the background,
 * measuring exact network duration and updating the sync log without blocking the UI.
 */
export function aopBackgroundSync<TArgs extends any[]>(
  name: string,
  actionType: SyncActionType,
  cloudFn: (...args: TArgs) => Promise<any>,
  getPayload?: (...args: TArgs) => any
): (...args: TArgs) => void {
  return (...args: TArgs): void => {
    const timeStr = new Date().toLocaleTimeString();
    const payload = getPayload ? getPayload(...args) : args[0];

    // Security Gate: Cloud sync is strictly impossible without signing in.
    // The action is safely preserved in local storage outbox until the user logs in.
    if (!isSyncAuthenticated()) {
      recordSyncAction(actionType, payload, 'pending', 'Sign in required for cloud sync');
      console.log(
        `%c[Scrollbound AOP ${timeStr}] 🔒 [${name}] saved locally (cloud sync requires sign-in)`,
        'color: #94a3b8; font-weight: bold; padding: 2px 6px;'
      );
      return;
    }

    const logEntry = recordSyncAction(actionType, payload, 'pending');

    console.log(
      `%c[Scrollbound AOP ${timeStr}] ⚡ [${name}] queued for non-blocking background sync`,
      'color: #8b5cf6; font-weight: bold; padding: 2px 6px;'
    );

    const startTime = performance.now();

    // Detached background execution
    setTimeout(async () => {
      try {
        const res = await cloudFn(...args);
        const durationMs = Math.round(performance.now() - startTime);
        const formatted = formatDuration(durationMs);

        markSyncActionStatus(logEntry.id, 'synced', undefined, durationMs);

        console.log(
          `%c[Scrollbound AOP ${new Date().toLocaleTimeString()}] ✅ [${name}] background cloud sync finished in ${formatted}`,
          'color: #10b981; font-weight: bold; padding: 2px 6px;'
        );
      } catch (err: unknown) {
        const durationMs = Math.round(performance.now() - startTime);
        const formatted = formatDuration(durationMs);
        const errMsg = err instanceof Error ? err.message : String(err);

        markSyncActionStatus(logEntry.id, 'failed', errMsg, durationMs);

        console.warn(
          `%c[Scrollbound AOP ${new Date().toLocaleTimeString()}] ❌ [${name}] background sync failed after ${formatted} (queued for auto-retry): ${errMsg}`,
          'color: #ef4444; font-weight: bold; padding: 2px 6px;'
        );
      }
    }, 10);
  };
}
