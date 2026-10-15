import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../state/ThemeContext.jsx';

/**
 * Compact icon toggle for the header. Shows the sun in dark mode (click for light)
 * and the moon in light mode (click for dark). It is a native <button>, so it is
 * keyboard accessible by default.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-theme-state={theme}
    >
      {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
