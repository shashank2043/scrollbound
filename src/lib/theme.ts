import { FontFamily, ReaderSettings } from './types';

export interface PresetTheme {
  id: string;
  name: string;
  bg: string;
  text: string;
  accent: string;
}

export const PRESET_THEMES: Record<string, PresetTheme> = {
  light: {
    id: 'light',
    name: 'Light',
    bg: '#fbfbfb',
    text: '#1e293b',
    accent: '#2563eb',
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    bg: '#121214',
    text: '#e2e8f0',
    accent: '#60a5fa',
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    bg: '#fbf0d9',
    text: '#433422',
    accent: '#b45309',
  },
};

export const FONT_FAMILIES: Record<FontFamily, { name: string; css: string }> = {
  serif: {
    name: 'Serif',
    css: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  sans: {
    name: 'Sans-serif',
    css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  poppins: {
    name: 'Poppins',
    css: 'var(--font-poppins), sans-serif',
  },
  mono: {
    name: 'Monospace',
    css: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  dyslexic: {
    name: 'Dyslexia-friendly',
    css: '"OpenDyslexic", "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
  },
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.7,
  contentWidth: 65,
  themeId: 'light',
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 5, // Default 5 minutes
};

/**
 * Calculate relative luminance of a hex color
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return 0.5;

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const srgb = [r, g, b].map((val) =>
    val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * Calculate WCAG contrast ratio between text and background colors
 */
export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  try {
    const l1 = getRelativeLuminance(fgHex);
    const l2 = getRelativeLuminance(bgHex);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 21;
  }
}

/**
 * Apply theme CSS variables to the document element
 */
export function applyThemeVariables(
  theme: { bg: string; text: string; accent: string },
  settings?: Partial<ReaderSettings>
) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--sb-bg', theme.bg);
  root.style.setProperty('--sb-text', theme.text);
  root.style.setProperty('--sb-accent', theme.accent);

  if (settings?.fontSize) {
    root.style.setProperty('--sb-font-size', `${settings.fontSize}px`);
  }
  if (settings?.fontFamily && FONT_FAMILIES[settings.fontFamily]) {
    root.style.setProperty('--sb-font-family', FONT_FAMILIES[settings.fontFamily].css);
  }
  if (settings?.lineHeight) {
    root.style.setProperty('--sb-line-height', `${settings.lineHeight}`);
  }
  if (settings?.contentWidth) {
    root.style.setProperty('--sb-content-width', `${settings.contentWidth}ch`);
  }
}
