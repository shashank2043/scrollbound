'use client';

import { useState, useEffect, useCallback } from 'react';
import { CustomTheme, ReaderSettings } from '../lib/types';
import {
  DEFAULT_SETTINGS,
  PRESET_THEMES,
  applyThemeVariables,
} from '../lib/theme';
import {
  getCustomThemes,
  saveCustomTheme,
  deleteCustomTheme,
  getLocalSettings,
  saveSettings,
  getSettings,
  setAutoSyncConfig,
} from '../lib/db';

export function useSettings() {
  // 1. Immediately read settings from localStorage for 0ms initial render
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const local = getLocalSettings();
    if (local) return local;
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    const isDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      ...DEFAULT_SETTINGS,
      themeId: isDark ? 'dark' : 'light',
    };
  });

  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load custom themes from local storage / DB and apply theme variables
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

  // Sync settings with cloud if local wasn't present or on initial mount
  useEffect(() => {
    getSettings().then((cloudSettings) => {
      if (cloudSettings) {
        setSettings((prev) => {
          const merged = { ...prev, ...cloudSettings };
          const activeTheme =
            PRESET_THEMES[merged.themeId] ||
            customThemes.find((t) => t.id === merged.themeId) ||
            PRESET_THEMES.light;
          applyThemeVariables(activeTheme, merged);
          return merged;
        });
      }
    });
  }, [customThemes]);

  // Update settings: dual-write to local storage and PostgreSQL in parallel
  const updateSettings = useCallback(
    (newSettings: Partial<ReaderSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        saveSettings(next); // writes to local storage AND database in parallel

        // Dynamically adjust auto sync timer or disable it
        if (
          typeof next.autoSyncEnabled === 'boolean' ||
          typeof next.autoSyncIntervalMinutes === 'number'
        ) {
          setAutoSyncConfig(
            next.autoSyncEnabled ?? true,
            next.autoSyncIntervalMinutes ?? 5
          );
        }

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

  // Add custom theme: dual-write
  const addCustomTheme = useCallback(async (theme: CustomTheme) => {
    await saveCustomTheme(theme);
    setCustomThemes((prev) => {
      const filtered = prev.filter((t) => t.id !== theme.id);
      return [...filtered, theme];
    });
    // Automatically switch to the newly created theme
    updateSettings({ themeId: theme.id });
  }, [updateSettings]);

  // Remove custom theme: dual-write
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

  return {
    settings,
    customThemes,
    isLoaded,
    updateSettings,
    addCustomTheme,
    removeCustomTheme,
  };
}
