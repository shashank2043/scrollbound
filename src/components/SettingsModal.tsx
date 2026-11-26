'use client';

import React, { useState, useEffect } from 'react';
import { CustomTheme, FontFamily, ReaderSettings } from '../lib/types';
import { FONT_FAMILIES } from '../lib/theme';
import { ThemePicker } from './ThemePicker';
import {
  getLocalSyncLog,
  getPendingSyncActions,
  flushPendingSyncQueue,
  SyncLogEntry,
} from '../lib/syncEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  customThemes: CustomTheme[];
  onUpdateSettings: (settings: Partial<ReaderSettings>) => void;
  onAddCustomTheme: (theme: CustomTheme) => Promise<void>;
  onRemoveCustomTheme: (id: string) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  customThemes,
  onUpdateSettings,
  onAddCustomTheme,
  onRemoveCustomTheme,
}: SettingsModalProps) {
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const [showLogDetails, setShowLogDetails] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSyncLog(getLocalSyncLog().reverse()); // show newest first
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pendingCount = syncLog.filter((e) => e.status !== 'synced').length;

  const handleManualSync = async () => {
    setIsFlushing(true);
    await flushPendingSyncQueue();
    setSyncLog(getLocalSyncLog().reverse());
    setIsFlushing(false);
  };

  const formatActionName = (action: string) => {
    switch (action) {
      case 'UPDATE_PROGRESS':
        return 'Reading Progress';
      case 'ADD_BOOKMARK':
        return 'Bookmark Added';
      case 'DELETE_BOOKMARK':
        return 'Bookmark Removed';
      case 'UPDATE_BOOKMARK_NOTE':
        return 'Bookmark Note Updated';
      case 'SAVE_SETTINGS':
        return 'Appearance Settings';
      case 'SAVE_THEME':
        return 'Custom Theme Saved';
      case 'DELETE_THEME':
        return 'Custom Theme Removed';
      case 'DELETE_BOOK':
        return 'Book Deleted';
      default:
        return action;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.25)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span>⚙️</span> Appearance & Typography
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="py-5 space-y-6">
          {/* Font Size */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
              <span>Text Size</span>
              <span className="font-mono text-sm font-bold opacity-100">
                {settings.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })
                }
                className="w-9 h-9 rounded-xl border border-black/15 dark:border-white/15 flex items-center justify-center font-bold text-sm hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition"
                title="Decrease font size"
              >
                A-
              </button>
              <input
                type="range"
                min="14"
                max="32"
                step="1"
                value={settings.fontSize}
                onChange={(e) =>
                  onUpdateSettings({ fontSize: parseInt(e.target.value, 10) })
                }
                className="flex-1 accent-blue-600 cursor-pointer"
              />
              <button
                onClick={() =>
                  onUpdateSettings({ fontSize: Math.min(32, settings.fontSize + 1) })
                }
                className="w-9 h-9 rounded-xl border border-black/15 dark:border-white/15 flex items-center justify-center font-bold text-base hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition"
                title="Increase font size"
              >
                A+
              </button>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
              Font Family
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(FONT_FAMILIES) as FontFamily[]).map((famKey) => {
                const fam = FONT_FAMILIES[famKey];
                const isSelected = settings.fontFamily === famKey;
                return (
                  <button
                    key={famKey}
                    onClick={() => onUpdateSettings({ fontFamily: famKey })}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-16 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-500/10 font-bold shadow-sm'
                        : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs opacity-70 leading-tight">
                      {fam.name}
                    </span>
                    <span
                      className="text-base truncate"
                      style={{ fontFamily: fam.css }}
                    >
                      Aa
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Spacing */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
              <span>Line Height</span>
              <span className="font-mono text-xs font-semibold">
                {settings.lineHeight}x
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1.4, 1.6, 1.8, 2.0].map((lh) => (
                <button
                  key={lh}
                  onClick={() => onUpdateSettings({ lineHeight: lh })}
                  className={`py-2 text-xs rounded-xl border font-mono font-medium transition ${
                    settings.lineHeight === lh
                      ? 'border-blue-600 bg-blue-500/10 font-bold'
                      : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {lh}
                </button>
              ))}
            </div>
          </div>

          {/* Page Width */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
              <span>Reading Margins</span>
              <span className="font-mono text-xs font-semibold">
                {settings.contentWidth}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="85"
                step="5"
                value={settings.contentWidth}
                onChange={(e) =>
                  onUpdateSettings({ contentWidth: parseInt(e.target.value, 10) })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Theme Picker */}
          <div className="border-t border-black/10 dark:border-white/10 pt-4">
            <ThemePicker
              settings={settings}
              customThemes={customThemes}
              onSelectTheme={(themeId) => onUpdateSettings({ themeId })}
              onAddCustomTheme={onAddCustomTheme}
              onRemoveCustomTheme={onRemoveCustomTheme}
            />
          </div>

          {/* Sync Engine: Last 50 Steps Local & Cloud Log */}
          <div className="border-t border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60 flex items-center gap-1.5">
                <span>🔄</span>
                <span>Cloud & Local Sync (Last 50 Steps)</span>
              </label>
              <button
                onClick={handleManualSync}
                disabled={isFlushing}
                className="text-xs px-2.5 py-1 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1 disabled:opacity-50"
              >
                <span>{isFlushing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>

            {/* Auto-Sync Configuration Controls */}
            <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-3 text-xs mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span>🔁</span>
                    <span>Auto Background Sync</span>
                  </div>
                  <div className="text-[11px] opacity-60">
                    Automatically compare & retry failed uploads in background
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSyncEnabled ?? true}
                    onChange={(e) =>
                      onUpdateSettings({ autoSyncEnabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {(settings.autoSyncEnabled ?? true) && (
                <div className="pt-2 border-t border-black/10 dark:border-white/10">
                  <div className="flex items-center justify-between text-[11px] opacity-75 mb-1.5">
                    <span>Sync Interval:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      Every {settings.autoSyncIntervalMinutes ?? 5} min
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[1, 2, 5, 10, 15, 30].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => onUpdateSettings({ autoSyncIntervalMinutes: mins })}
                        className={`py-1.5 px-2 text-[11px] rounded-lg border font-medium transition ${
                          (settings.autoSyncIntervalMinutes ?? 5) === mins
                            ? 'border-blue-600 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold shadow-sm'
                            : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 opacity-80'
                        }`}
                      >
                        {mins}m {mins === 5 ? '★' : ''}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] opacity-50 mt-1.5">
                    ★ 5 minutes is the recommended default for low battery & data usage.
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="opacity-80">Status:</span>
                <span className="font-medium flex items-center gap-1.5">
                  {pendingCount === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      All steps in sync with cloud
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      {pendingCount} action(s) awaiting cloud sync
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] opacity-70">
                <span>Schedule:</span>
                <span>
                  {settings.autoSyncEnabled ?? true
                    ? `Auto-sync active every ${settings.autoSyncIntervalMinutes ?? 5} min`
                    : 'Auto-sync turned off'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] opacity-70">
                <span>Logged actions:</span>
                <span>{syncLog.length} of 50 steps recorded</span>
              </div>

              <button
                onClick={() => setShowLogDetails(!showLogDetails)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline pt-1 block"
              >
                {showLogDetails ? '▲ Hide step log' : '▼ View last 50 steps log'}
              </button>

              {showLogDetails && (
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1 border-t border-black/10 dark:border-white/10 pt-2 font-mono text-[11px]">
                  {syncLog.length === 0 ? (
                    <div className="text-center py-3 opacity-50 font-sans">
                      No actions logged yet.
                    </div>
                  ) : (
                    syncLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={
                              entry.status === 'synced'
                                ? 'text-emerald-500'
                                : 'text-amber-500'
                            }
                          >
                            {entry.status === 'synced' ? '✓' : '⟳'}
                          </span>
                          <span className="font-semibold font-sans">
                            {formatActionName(entry.action)}
                          </span>
                          {entry.durationMs !== undefined && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                              {entry.durationMs >= 1000
                                ? `${(entry.durationMs / 1000).toFixed(2)}s`
                                : `${entry.durationMs}ms`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-60 shrink-0">
                          <span>
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                          <span
                            className={`px-1 py-0.5 rounded text-[9px] font-sans uppercase font-bold ${
                              entry.status === 'synced'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {entry.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-4 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition shadow"
            style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
