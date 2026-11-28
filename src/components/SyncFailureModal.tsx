'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import {
  SyncLogEntry,
  subscribeTerminalFailure,
  retryActionInForeground,
  rollbackLocalAction,
} from '../lib/syncEngine';
import { CircularProgress } from './CircularProgress';

export function SyncFailureModal() {
  const [failedAction, setFailedAction] = useState<SyncLogEntry | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryStage, setRetryStage] = useState<string>('');
  const [retryPercent, setRetryPercent] = useState<number>(0);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  useEffect(() => {
    // Subscribe to terminal sync failures (failed 3+ automatic tries)
    const unsubscribe = subscribeTerminalFailure((entry) => {
      setFailedAction(entry);
      setIsRetrying(false);
      setIsSuccess(false);
      setRetryError(null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!failedAction) return null;

  const getActionTitle = (action: string) => {
    switch (action) {
      case 'UPDATE_PROGRESS':
        return 'Reading Progress Sync';
      case 'ADD_BOOKMARK':
        return 'Bookmark Creation';
      case 'DELETE_BOOKMARK':
        return 'Bookmark Deletion';
      case 'UPDATE_BOOKMARK_NOTE':
        return 'Bookmark Note Update';
      case 'SAVE_SETTINGS':
        return 'Appearance Settings';
      case 'SAVE_THEME':
        return 'Custom Theme Save';
      case 'DELETE_THEME':
        return 'Custom Theme Deletion';
      case 'DELETE_BOOK':
        return 'Book Deletion';
      default:
        return action;
    }
  };

  const getImpactDescription = (action: string) => {
    switch (action) {
      case 'UPDATE_PROGRESS':
        return 'Your reading progress is only saved on this device. If you log in on another phone, tablet, or laptop, it will open at the previous cloud position, causing your devices to be out of sync.';
      case 'ADD_BOOKMARK':
      case 'UPDATE_BOOKMARK_NOTE':
        return 'This bookmark exists only in this browser. You will not be able to view or jump to this bookmark from your other logged-in devices.';
      case 'DELETE_BOOKMARK':
        return 'This bookmark was removed locally, but still exists on your cloud account and will re-appear if you open the novel on another device.';
      case 'SAVE_SETTINGS':
      case 'SAVE_THEME':
      case 'DELETE_THEME':
        return 'Your appearance and reading preferences will not apply on your other devices.';
      case 'DELETE_BOOK':
        return 'This novel was removed from your local library, but remains in your cloud account on other devices.';
      default:
        return 'This change is stored locally on this machine only and will not synchronize to other devices.';
    }
  };

  const handleRetryForeground = async () => {
    if (!failedAction) return;
    setIsRetrying(true);
    setRetryError(null);
    setRetryStage('Initiating connection...');
    setRetryPercent(15);

    const result = await retryActionInForeground(failedAction.id, (p) => {
      setRetryStage(p.stage);
      setRetryPercent(p.percent);
    });

    if (result.success) {
      setIsSuccess(true);
      setTimeout(() => {
        setFailedAction(null);
        setIsRetrying(false);
        setIsSuccess(false);
      }, 1500);
    } else {
      setIsRetrying(false);
      setRetryError(result.error || 'Retry attempt failed.');
    }
  };

  const handleDiscardLocal = async () => {
    if (!failedAction) return;
    setIsDiscarding(true);
    await rollbackLocalAction(failedAction.id);
    setIsDiscarding(false);
    setFailedAction(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all border border-amber-500/30"
        style={{
          backgroundColor: 'var(--sb-bg, #ffffff)',
          color: 'var(--sb-text, #1e293b)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-black/10 dark:border-white/10">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-bold text-base leading-tight">
              Cloud Upload Failed (3 Tries Exhausted)
            </h3>
            <p className="text-xs opacity-60">Out-of-Sync Prevention</p>
          </div>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-3.5 text-xs">
          {/* Action Description */}
          <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs opacity-90">Failed Action:</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                {getActionTitle(failedAction.action)}
              </span>
            </div>
            <div className="text-[11px] opacity-70">
              Tried 3 automatic background retries without reaching the cloud database.
            </div>
            {failedAction.error && (
              <div className="text-[10px] font-mono text-red-500 dark:text-red-400 pt-1 truncate">
                Reason: {failedAction.error}
              </div>
            )}
          </div>

          {/* Impact Warning */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Potential Impact:</span>
            </div>
            <p className="text-[11px] opacity-90">
              {getImpactDescription(failedAction.action)}
            </p>
          </div>

          {/* Active Foreground Progress Indicator */}
          {isRetrying && (
            <div className="py-3 flex flex-col items-center justify-center space-y-2 bg-blue-500/5 rounded-xl border border-blue-500/20 p-4">
              <CircularProgress
                size={40}
                strokeWidth={3.5}
                progress={retryPercent}
              />
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 font-mono">
                {retryStage}
              </div>
            </div>
          )}

          {isSuccess && (
            <div className="py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-center text-xs flex items-center justify-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              <span>Cloud upload successful! Synchronized.</span>
            </div>
          )}

          {retryError && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              {retryError}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!isRetrying && !isSuccess && (
          <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-black/10 dark:border-white/10">
            <button
              onClick={handleRetryForeground}
              className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-white shadow transition flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry in Foreground</span>
            </button>
            <button
              onClick={handleDiscardLocal}
              disabled={isDiscarding}
              className="py-2.5 px-3 rounded-xl font-medium text-xs border border-black/15 dark:border-white/15 hover:bg-red-500/10 hover:text-red-500 transition"
              title="Reverts the unsynced local change to match the cloud state"
            >
              <span>{isDiscarding ? 'Discarding...' : 'Discard & Align with Cloud'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
