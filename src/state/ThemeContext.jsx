/**
 * Global theme state (light | dark).
 *  - Single source of truth: one ThemeProvider at the app root, read via useTheme().
 *  - Persisted in localStorage under THEME_STORAGE_KEY.
 *  - Applied as <html data-theme="..."> so every CSS variable switches at once.
 *  - Default is dark when nothing valid is stored.
 * The index.html inline script sets the attribute before React renders (no flash).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'distributed-mutex-theme';
export const THEMES = ['light', 'dark'];
export const DEFAULT_THEME = 'dark';

export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (e.g. privacy mode): theme still works for this session */
  }
}

export function applyThemeToDocument(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyThemeToDocument(theme);
    persistTheme(theme);
  }, [theme]);

  // Keep other open tabs in sync with the saved choice.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY && THEMES.includes(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}
