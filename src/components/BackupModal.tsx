'use client';

import React, { useState, useRef } from 'react';
import { exportAllData, importAllData, requestPersistentStorage } from '../lib/db';
import { ExportData, ReaderSettings } from '../lib/types';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onDataImported: () => void;
}

export function BackupModal({
  isOpen,
  onClose,
  settings,
  onDataImported,
}: BackupModalProps) {
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      const data = await exportAllData(settings);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrollbound-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg({ text: 'Backup downloaded successfully!' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Export failed: ${msg}`, isError: true });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed: ExportData = JSON.parse(text);
      if (!parsed.version || !Array.isArray(parsed.books)) {
        throw new Error('Unrecognized backup format. Please select a valid Scrollbound JSON backup.');
      }
      await importAllData(parsed);
      setStatusMsg({ text: `Imported ${parsed.books.length} book(s) and associated chunks successfully!` });
      onDataImported();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Import error: ${msg}`, isError: true });
    }
  };

  const handlePersistentStorage = async () => {
    const res = await requestPersistentStorage();
    setIsPersisted(res.isPersisted);
    setStatusMsg({
      text: res.message,
      isError: !res.isPersisted && !res.message.includes('already granted'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
          border: '1px solid rgba(128, 128, 128, 0.25)',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span>💾</span> Data Backup & Safety
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="py-5 space-y-5">
          {statusMsg && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                statusMsg.isError
                  ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {/* Persistent storage */}
          <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 space-y-2 bg-black/5 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Browser Storage Persistence</span>
                {isPersisted && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-green-500/20 text-green-600 font-bold">
                    Persisted
                  </span>
                )}
              </div>
              <button
                onClick={handlePersistentStorage}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition shadow"
                style={{ backgroundColor: 'var(--sb-accent, #2563eb)' }}
              >
                Request Persistence
              </button>
            </div>
            <p className="text-xs opacity-70">
              By default, browsers may clear local storage under low disk space. Requesting persistence ensures your books and bookmarks remain stored permanently.
            </p>
          </div>

          {/* Export JSON */}
          <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm">Export All App Data</div>
              <div className="text-xs opacity-70 mt-0.5">
                Download all extracted books, chunks, progress, bookmarks, and settings as a single JSON file.
              </div>
            </div>
            <button
              onClick={handleExport}
              className="shrink-0 px-4 py-2 text-xs font-semibold rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
              style={{ borderColor: 'rgba(128,128,128,0.3)' }}
            >
              <span>⬇️</span> Export JSON
            </button>
          </div>

          {/* Import JSON */}
          <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm">Restore from Backup</div>
              <div className="text-xs opacity-70 mt-0.5">
                Import books and settings from a previously exported Scrollbound JSON file.
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 px-4 py-2 text-xs font-semibold rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
                style={{ borderColor: 'rgba(128,128,128,0.3)' }}
              >
                <span>⬆️</span> Import JSON
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
