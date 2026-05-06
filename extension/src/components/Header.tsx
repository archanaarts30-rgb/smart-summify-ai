import React from 'react';
import { useStore } from '../store';
import { logout } from '../lib/firebase';

export default function Header() {
  const { user, clearUser, theme, toggleTheme, fontSize, increaseFontSize, decreaseFontSize } = useStore();

  const handleLogout = async () => {
    await logout();
    clearUser();
  };

  const planColors: Record<string, string> = {
    free: '#71717a',
    basic: '#d97706',
    premium: '#7c3aed',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Logo + plan */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>Smart Summify</span>
        {user && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: planColors[user.plan] + '20',
            color: planColors[user.plan], textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {user.plan}
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Font size */}
        <button onClick={decreaseFontSize} title="Decrease font" style={iconBtn}>A-</button>
        <button onClick={increaseFontSize} title="Increase font" style={iconBtn}>A+</button>

        {/* Dark mode toggle */}
        <button onClick={toggleTheme} title="Toggle theme" style={iconBtn}>
          {theme === 'dark' ? '☀' : '◑'}
        </button>

        {/* Logout */}
        <button onClick={handleLogout} title="Sign out" style={{ ...iconBtn, color: 'var(--danger)' }}>
          ⏏
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '3px 7px', fontSize: 12,
  color: 'var(--text2)', cursor: 'pointer', fontWeight: 600,
};
