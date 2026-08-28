/**
 * Local Pulse — Theme Engine (Slate Dark / Zinc Light)
 * Zero-FOUC theme controller with localStorage persistence and OS prefers-color-scheme sync.
 */

const STORAGE_KEY = 'localpulse_theme';

/**
 * Get current system preference ('dark' | 'light')
 * @returns {'dark' | 'light'}
 */
export function getSystemPreference() {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (e) {
    return 'dark';
  }
}

/**
 * Get current active theme
 * @returns {'dark' | 'light'}
 */
export function getCurrentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Set active theme and apply classes/attributes
 * @param {'dark' | 'light'} theme
 * @param {boolean} [persist=true]
 * @returns {'dark' | 'light'}
 */
export function setTheme(theme, persist = true) {
  const isDark = theme === 'dark';
  
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#020617' : '#fafafa');
    }

    // Update Theme Toggle Button Icon / Label if available
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      themeBtn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      const iconSpan = themeBtn.querySelector('.theme-toggle-icon');
      if (iconSpan) {
        iconSpan.textContent = isDark ? '☀️' : '🌙';
      }
    }

    // Dispatch custom event for charts, map, etc.
    const event = new CustomEvent('themechange', {
      detail: { theme, isDark }
    });
    window.dispatchEvent(event);
  }

  if (persist && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Failed to save theme in localStorage:', e);
    }
  }

  return theme;
}

/**
 * Toggle between dark and light mode
 * @returns {'dark' | 'light'}
 */
export function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  return setTheme(next, true);
}

/**
 * Initialize theme engine from localStorage or OS preference
 * @returns {'dark' | 'light'}
 */
export function initTheme() {
  let initialTheme = 'dark';

  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        initialTheme = saved;
      } else {
        initialTheme = getSystemPreference();
      }
    } catch (e) {
      initialTheme = getSystemPreference();
    }
  } else {
    initialTheme = getSystemPreference();
  }

  setTheme(initialTheme, false);

  // Listen to OS prefers-color-scheme changes if user hasn't explicitly set preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (!saved) {
            setTheme(e.matches ? 'dark' : 'light', false);
          }
        } catch (err) {
          // Ignore error
        }
      });
    } catch (e) {
      // Ignore media query error
    }
  }

  // Attach button click listener
  if (typeof document !== 'undefined') {
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        toggleTheme();
      });
    }
  }

  return initialTheme;
}

// Window global fallback
const THEME = {
  initTheme,
  toggleTheme,
  getCurrentTheme,
  setTheme,
  getSystemPreference
};

export default THEME;

if (typeof window !== 'undefined') {
  window.LocalPulseTheme = THEME;
}

