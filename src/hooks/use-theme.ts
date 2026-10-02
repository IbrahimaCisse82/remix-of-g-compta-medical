import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type MedicalPalette = 'clinique' | 'laboratoire' | 'urgences';

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.toggle('light', resolved === 'light');
}

function applyMedicalPalette(palette: MedicalPalette | null) {
  const root = document.documentElement;
  root.classList.remove('palette-clinique', 'palette-laboratoire', 'palette-urgences');
  if (palette) root.classList.add(`palette-${palette}`);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('g-compta-theme') as Theme) || 'dark';
  });

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('g-compta-theme', t);
    applyTheme(t);
  }, []);

  const toggle = useCallback(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const resolved = theme === 'system' ? getSystemTheme() : theme;

  return { theme, resolved, setTheme, toggle };
}

export function useMedicalPalette(initialPalette: MedicalPalette = 'clinique') {
  const [palette, setPaletteState] = useState<MedicalPalette>(() =>
    (localStorage.getItem('g-sante-palette') as MedicalPalette) || initialPalette,
  );

  const setPalette = useCallback((next: MedicalPalette) => {
    setPaletteState(next);
    localStorage.setItem('g-sante-palette', next);
    applyMedicalPalette(next);
  }, []);

  useEffect(() => {
    applyMedicalPalette(palette);
    return () => applyMedicalPalette(null);
  }, [palette]);

  return { palette, setPalette };
}
