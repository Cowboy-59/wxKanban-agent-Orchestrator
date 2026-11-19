import React, { createContext, useContext, useEffect, useState } from 'react';
// @ts-expect-error Vite ESM import (no .ts extension needed)
import { Theme, getStoredTheme, getSystemTheme, saveTheme, applyTheme, initializeTheme } from '../lib/themePreference';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * ThemeProvider - Wraps app and manages theme state
 * Applies theme to document on mount and changes
 * Default: Dark mode (or system preference if stored)
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from stored preference or system default
  const [theme, setTheme] = useState<Theme>(initializeTheme());

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current: Theme) => {
      const next = current === 'light' ? 'dark' : 'light';
      saveTheme(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to use theme in components
 * Throws error if used outside ThemeProvider
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
