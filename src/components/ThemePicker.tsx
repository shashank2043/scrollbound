'use client';

import React, { useState } from 'react';
import { CustomTheme, ReaderSettings } from '../lib/types';
import {
  PRESET_THEMES,
  calculateContrastRatio,
} from '../lib/theme';

interface ThemePickerProps {
  settings: ReaderSettings;
  customThemes: CustomTheme[];
  onSelectTheme: (themeId: string) => void;
  onAddCustomTheme: (theme: CustomTheme) => Promise<void>;
  onRemoveCustomTheme: (id: string) => Promise<void>;
}

export function ThemePicker({
  settings,
  customThemes,
  onSelectTheme,
  onAddCustomTheme,
  onRemoveCustomTheme,
}: ThemePickerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBg, setCustomBg] = useState('#1e2022');
  const [customText, setCustomText] = useState('#e0e0e0');
  const [customAccent, setCustomAccent] = useState('#3b82f6');
  const [error, setError] = useState<string | null>(null);

  const contrast = calculateContrastRatio(customText, customBg);
  const isPoorContrast = contrast < 4.5;

  const handleSaveCustom = async () => {
    if (!customName.trim()) {
      setError('Please provide a name for your custom theme.');
      return;
    }
    setError(null);
    const newTheme: CustomTheme = {
      id: 'custom_' + Date.now(),
      name: customName.trim(),
      bg: customBg,
      text: customText,
      accent: customAccent,
    };
    await onAddCustomTheme(newTheme);
    setIsCreating(false);
    setCustomName('');
  };

  return (
    <div className="space-y-4">
      {/* Preset Themes */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
          Color Themes
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {Object.values(PRESET_THEMES).map((theme) => {
            const isSelected = settings.themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => onSelectTheme(theme.id)}
                className={`flex flex-col items-center justify-between p-3 rounded-xl border text-xs font-medium transition ${
                  isSelected
                    ? 'ring-2 ring-offset-2 ring-blue-500 scale-[1.02]'
                    : 'opacity-80 hover:opacity-100 hover:scale-[1.01]'
                }`}
                style={{
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: isSelected ? 'var(--sb-accent, #2563eb)' : 'rgba(128,128,128,0.3)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-black/20"
                    style={{ backgroundColor: theme.accent }}
                  />
                  <span>{theme.name}</span>
                </div>
                <div className="text-[10px] opacity-70">Aa Bb Cc</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Themes list */}
      {customThemes.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
            Your Custom Themes
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {customThemes.map((theme) => {
              const isSelected = settings.themeId === theme.id;
              return (
                <div
                  key={theme.id}
                  className={`relative flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition ${
                    isSelected ? 'ring-2 ring-offset-2 ring-blue-500' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: theme.bg,
                    color: theme.text,
                    borderColor: isSelected ? 'var(--sb-accent, #2563eb)' : 'rgba(128,128,128,0.3)',
                  }}
                >
                  <button
                    onClick={() => onSelectTheme(theme.id)}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: theme.accent }}
                    />
                    <span className="truncate">{theme.name}</span>
                  </button>
                  <button
                    onClick={() => onRemoveCustomTheme(theme.id)}
                    className="text-gray-400 hover:text-red-500 p-1 transition"
                    title="Delete theme"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Custom Theme Trigger */}
      {!isCreating ? (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-dashed border-gray-400 dark:border-gray-600 hover:border-blue-500 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center justify-center gap-1.5"
        >
          <span>🎨</span> Create Custom Color Theme
        </button>
      ) : (
        /* Create Custom Theme Form */
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 space-y-3 bg-black/5 dark:bg-white/5 animate-fade-in text-xs">
          <div className="flex items-center justify-between font-semibold">
            <span>New Custom Theme</span>
            <button
              onClick={() => setIsCreating(false)}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block opacity-75 mb-1">Theme Name</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Midnight Blue, Matcha, Forest"
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block opacity-75 mb-1">Background</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={customBg}
                  onChange={(e) => setCustomBg(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                />
                <span className="font-mono text-[10px] opacity-80">{customBg}</span>
              </div>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Text Color</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                />
                <span className="font-mono text-[10px] opacity-80">{customText}</span>
              </div>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Accent</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={customAccent}
                  onChange={(e) => setCustomAccent(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                />
                <span className="font-mono text-[10px] opacity-80">{customAccent}</span>
              </div>
            </div>
          </div>

          {/* Contrast warning */}
          <div
            className={`p-2 rounded-lg border flex items-center gap-2 ${
              isPoorContrast
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
            }`}
          >
            <span>{isPoorContrast ? '⚠️' : '✓'}</span>
            <div className="flex-1">
              <span className="font-semibold">
                Contrast Ratio: {contrast.toFixed(2)}:1
              </span>
              {isPoorContrast ? (
                <span> — Poor readability warning! WCAG AA requires at least 4.5:1.</span>
              ) : (
                <span> — Great readability.</span>
              )}
            </div>
          </div>

          {/* Live Preview Box */}
          <div
            className="p-3 rounded-lg border text-center transition"
            style={{
              backgroundColor: customBg,
              color: customText,
              borderColor: customAccent,
            }}
          >
            <div className="font-serif text-sm font-semibold mb-0.5">Sample Preview Title</div>
            <div className="text-xs opacity-90">
              This is how your text will look while reading comfortable novels in Scrollbound.
            </div>
          </div>

          {error && <div className="text-red-500 text-xs">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCustom}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow"
            >
              Save Custom Theme
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
