import React, { createContext, useContext } from 'react';

export type Appearance = 'dark' | 'light' | 'system';

/**
 * Semantic color roles used across the app. Screens reference these instead of
 * raw hex so the whole UI can flip between dark and light palettes.
 */
export interface Theme {
  mode: 'dark' | 'light';

  // Surfaces
  bg: string;          // primary screen background
  surface: string;     // cards, inputs, sheets
  surfaceAlt: string;  // secondary surface / pressed states

  // Text
  text: string;          // primary text
  textSecondary: string; // supporting text
  textMuted: string;     // labels, captions
  textFaint: string;     // disabled / hint text

  // Lines
  border: string;        // dividers, subtle outlines
  borderStrong: string;  // stronger outlines

  // Accent (primary buttons)
  accent: string;        // button background
  accentText: string;    // text on accent

  // Status / racing
  ahead: string;    // "ahead" green (text, markers)
  aheadBg: string;  // HUD background tint when ahead
  behind: string;   // "behind" red
  behindBg: string; // HUD background tint when behind
  even: string;     // neck-and-neck text
  evenBg: string;   // HUD neutral background
  warning: string;  // amber (ties, cautions)

  // Route / map
  routeStroke: string; // SVG route polyline
  ghostMuted: string;  // ghost marker gray
  mapDark: boolean;    // apply the dark basemap style

  // Misc
  overlay: string;     // modal scrim
}

export const darkTheme: Theme = {
  mode: 'dark',
  bg: '#000000',
  surface: '#111111',
  surfaceAlt: '#1a1a1a',
  text: '#ffffff',
  textSecondary: '#aaaaaa',
  textMuted: '#666666',
  textFaint: '#444444',
  border: '#222222',
  borderStrong: '#333333',
  accent: '#ffffff',
  accentText: '#000000',
  ahead: '#4caf50',
  aheadBg: '#032b13',
  behind: '#f44336',
  behindBg: '#360808',
  even: '#ffffff',
  evenBg: '#000000',
  warning: '#ffc107',
  routeStroke: '#555555',
  ghostMuted: '#888888',
  mapDark: true,
  overlay: 'rgba(0,0,0,0.7)',
};

export const lightTheme: Theme = {
  mode: 'light',
  bg: '#ffffff',
  surface: '#f2f2f5',
  surfaceAlt: '#e7e7ec',
  text: '#111111',
  textSecondary: '#444444',
  textMuted: '#8a8a8a',
  textFaint: '#b5b5b5',
  border: '#e2e2e6',
  borderStrong: '#cccccc',
  accent: '#111111',
  accentText: '#ffffff',
  ahead: '#2e7d32',
  aheadBg: '#a9e0b4',
  behind: '#c62828',
  behindBg: '#f19c90',
  even: '#111111',
  evenBg: '#ffffff',
  warning: '#b26a00',
  routeStroke: '#9aa0a6',
  ghostMuted: '#9aa0a6',
  mapDark: false,
  overlay: 'rgba(0,0,0,0.35)',
};

/** Resolve the effective theme from the user's setting and the OS scheme. */
export function resolveTheme(
  appearance: Appearance,
  systemScheme: 'dark' | 'light' | null | undefined,
): Theme {
  const mode = appearance === 'system' ? systemScheme ?? 'dark' : appearance;
  return mode === 'light' ? lightTheme : darkTheme;
}

const ThemeContext = createContext<Theme>(darkTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function ThemeProvider({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}
