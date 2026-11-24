'use client';

import React from 'react';
import { CustomTheme, FontFamily, ReaderSettings } from '../lib/types';
import { FONT_FAMILIES } from '../lib/theme';
import { ThemePicker } from './ThemePicker';

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
  if (!isOpen) return null;

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
                const isSelected = settings.fontFamily === famKey;
                return (
                  <button
                    key={famKey}
                    onClick={() => onUpdateSettings({ fontFamily: famKey })}
                    className={`py-2 px-3 text-xs rounded-xl border text-left transition ${
                      isSelected
                        ? 'ring-2 ring-offset-1 ring-blue-500 font-semibold'
                        : 'opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    style={{
                      fontFamily: FONT_FAMILIES[famKey].css,
                      borderColor: isSelected
                        ? 'var(--sb-accent, #2563eb)'
                        : 'rgba(128,128,128,0.2)',
                    }}
                  >
                    {FONT_FAMILIES[famKey].name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Height & Content Width */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
                <span>Line Height</span>
                <span className="font-mono text-xs">{settings.lineHeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.3"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) =>
                  onUpdateSettings({ lineHeight: parseFloat(e.target.value) })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
                <span>Line Length</span>
                <span className="font-mono text-xs">{settings.contentWidth}ch</span>
              </div>
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

          {/* Live Preview Sample */}
          <div className="border-t border-black/10 dark:border-white/10 pt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
              Live Preview
            </label>
            <div
              className="p-4 rounded-xl border border-black/10 dark:border-white/10 transition-all leading-relaxed"
              style={{
                fontSize: `${settings.fontSize}px`,
                fontFamily: FONT_FAMILIES[settings.fontFamily].css,
                lineHeight: settings.lineHeight,
              }}
            >
              <h4 className="font-bold mb-2">Chapter 1: The Open Road</h4>
              <p className="opacity-90">
                The morning sun broke through the misty woods, casting amber ribbons of light across the damp forest path. Every word flowed naturally into clean paragraphs, effortlessly reflowed across the page.
              </p>
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
