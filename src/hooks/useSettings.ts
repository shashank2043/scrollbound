'use client';

import { useState, useEffect, useCallback } from 'react';
import { CustomTheme, ReaderSettings } from '../lib/types';
import {
  DEFAULT_SETTINGS,
  PRESET_THEMES,
  applyThemeVariables,
} from '../lib/theme';
import { getCustomThemes, saveCustomTheme, deleteCustomTheme } from '../lib/db';

const STORAGE_KEY = 'scrollbound_reader_settings';

export function useSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
      const isDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      return {
        ...DEFAULT_SETTINGS,
        themeId: isDark ? 'dark' : 'light',
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load custom themes from IndexedDB and apply theme
  useEffect(() => {
    getCustomThemes()
      .then((themes) => {
        setCustomThemes(themes);
        setIsLoaded(true);

        const activeTheme =
          PRESET_THEMES[settings.themeId] ||
          themes.find((t) => t.id === settings.themeId) ||
          PRESET_THEMES.light;

        applyThemeVariables(activeTheme, settings);
      })
      .catch(() => {
        setIsLoaded(true);
        const activeTheme =
          PRESET_THEMES[settings.themeId] || PRESET_THEMES.light;
        applyThemeVariables(activeTheme, settings);
      });
  }, [settings]);

  // Update settings and reflect immediately in CSS variables and localStorage
  const updateSettings = useCallback(
    (newSettings: Partial<ReaderSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}

        const activeTheme =
          PRESET_THEMES[next.themeId] ||
          customThemes.find((t) => t.id === next.themeId) ||
          PRESET_THEMES.light;

        applyThemeVariables(activeTheme, next);
        return next;
      });
    },
    [customThemes]
  );

  // Add custom theme
  const addCustomTheme = useCallback(async (theme: CustomTheme) => {
    await saveCustomTheme(theme);
    setCustomThemes((prev) => {
      const filtered = prev.filter((t) => t.id !== theme.id);
      return [...filtered, theme];
    });
    // Automatically switch to the newly created theme
    updateSettings({ themeId: theme.id });
  }, [updateSettings]);

  // Remove custom theme
  const removeCustomTheme = useCallback(
    async (id: string) => {
      await deleteCustomTheme(id);
      setCustomThemes((prev) => prev.filter((t) => t.id !== id));
      if (settings.themeId === id) {
        updateSettings({ themeId: 'light' });
      }
    },
    [settings.themeId, updateSettings]
  );

  const activeTheme =
    PRESET_THEMES[settings.themeId] ||
    customThemes.find((t) => t.id === settings.themeId) ||
    PRESET_THEMES.light;

  return {
    settings,
    customThemes,
    activeTheme,
    updateSettings,
    addCustomTheme,
    removeCustomTheme,
    isLoaded,
  };
}
