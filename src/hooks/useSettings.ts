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
  getLocalCustomThemes,
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

  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => {
    return getLocalCustomThemes();
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // 2. Fetch custom themes and cloud settings ONCE on mount (no infinite loops)
  useEffect(() => {
    let isMounted = true;

    Promise.all([getCustomThemes(), getSettings()])
      .then(([themes, cloudSettings]) => {
        if (!isMounted) return;
        if (themes && themes.length > 0) {
          setCustomThemes(themes);
        }
        if (cloudSettings) {
          setSettings((prev) => ({ ...prev, ...cloudSettings }));
        }
        setIsLoaded(true);
      })
      .catch(() => {
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []); // Run strictly once on mount

  // 3. Apply theme CSS variables when themeId, custom themes, or typography settings change
  useEffect(() => {
    const activeTheme =
      PRESET_THEMES[settings.themeId] ||
      customThemes.find((t) => t.id === settings.themeId) ||
      PRESET_THEMES.light;

    applyThemeVariables(activeTheme, settings);
  }, [
    settings.themeId,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.contentWidth,
    customThemes,
  ]);

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

        return next;
      });
    },
    []
  );

  // Add custom theme: dual-write
  const addCustomTheme = useCallback(
    async (theme: CustomTheme) => {
      await saveCustomTheme(theme);
      setCustomThemes((prev) => {
        const filtered = prev.filter((t) => t.id !== theme.id);
        return [...filtered, theme];
      });
      // Automatically switch to the newly created theme
      updateSettings({ themeId: theme.id });
    },
    [updateSettings]
  );

  // Remove custom theme: dual-write
  const removeCustomTheme = useCallback(
    async (id: string) => {
      await deleteCustomTheme(id);
      setCustomThemes((prev) => prev.filter((t) => t.id !== id));
      setSettings((prev) => {
        if (prev.themeId === id) {
          const next = { ...prev, themeId: 'light' };
          saveSettings(next);
          return next;
        }
        return prev;
      });
    },
    []
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
