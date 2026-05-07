import React from 'react';
import { useStore } from '../store';
import { logout } from '../lib/firebase';

interface HeaderProps {
  onSignInClick: () => void;
}

export default function Header({ onSignInClick }: HeaderProps) {
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

  const getInitials = (displayName: string): string => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Logo + user avatar + plan badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>Smart Summify</span>
        {user && (
          <>
            {/* Avatar circle with initials */}
            <div
              title={user.displayName || user.email}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: `linear-gradient(135deg, ${planColors[user.plan]}, ${planColors[user.plan]}aa)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                letterSpacing: '0.03em', flexShrink: 0,
                boxShadow: `0 0 0 2px ${planColors[user.plan]}30`,
              }}
            >
              {getInitials(user.displayName || user.email)}
            </div>

            {/* Plan badge */}
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
              background: planColors[user.plan] + '20',
              color: planColors[user.plan], textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {user.plan}
            </span>
          </>
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

        {/* Sign in (guest) or Sign out (logged in) */}
        {user ? (
          <button onClick={handleLogout} title="Sign out" style={{ ...iconBtn, color: 'var(--danger)' }}>
            ⏏
          </button>
        ) : (
          <button
            onClick={onSignInClick}
            title="Sign in"
            style={{
              ...iconBtn,
              color: 'var(--accent)',
              borderColor: 'var(--accent)',
              fontWeight: 700,
              padding: '3px 10px',
            }}
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '3px 7px', fontSize: 12,
  color: 'var(--text2)', cursor: 'pointer', fontWeight: 600,
};
