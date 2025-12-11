/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '@/lib/state';
import cn from 'classnames';

export default function Header() {
  const { toggleSidebar, theme, toggleTheme } = useUI();

  // Dynamic palette that leverages the CSS variables defined for the active theme.
  // This allows the colors to "cycle" across the header layout (Left -> Right).
  const palette = [
    'var(--accent-blue)',  // Left Section Accent
    'var(--accent-green)', // Right Section Accent
    'var(--accent-red)'    // (Available for future expansion)
  ];

  const leftAccent = palette[0];
  const rightAccent = palette[1];

  return (
    <header>
      <div className="header-left">
        <h1 className="header-logo-text">
          Orbits Translator
          <span 
            className="accent-dot" 
            style={{ 
              color: leftAccent,
              WebkitTextFillColor: leftAccent 
            }}
          >
            .
          </span>
        </h1>
      </div>
      <div className="header-right">
        <button 
          className="theme-button" 
          onClick={toggleTheme}
          aria-label="Toggle Theme"
        >
          <span 
            className="icon header-icon" 
            style={{ color: theme === 'dark' ? '#FDB813' : 'var(--Blue-800)' }}
          >
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
        <button
          className="settings-button"
          onClick={toggleSidebar}
          aria-label="Settings"
        >
          <span 
            className="icon header-icon settings-icon"
            style={{ color: rightAccent }}
          >
            settings
          </span>
        </button>
      </div>
    </header>
  );
}