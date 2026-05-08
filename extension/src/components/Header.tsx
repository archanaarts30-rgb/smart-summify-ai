import React from 'react';
import { useStore } from '../store';

interface HeaderProps {
  onSignInClick: () => void;
  onAvatarClick?: () => void;
}

export default function Header({ onSignInClick, onAvatarClick }: HeaderProps) {
  const { user, theme, toggleTheme, usage } = useStore();

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
            {/* Clickable avatar — opens profile page */}
            <button
              onClick={onAvatarClick}
              title="View profile & billing"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: `linear-gradient(135deg, ${planColors[user.plan]}, ${planColors[user.plan]}bb)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                letterSpacing: '0.03em', flexShrink: 0,
                boxShadow: `0 0 0 2px ${planColors[user.plan]}40`,
                border: 'none', cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${planColors[user.plan]}60`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 2px ${planColors[user.plan]}40`;
              }}
            >
              {getInitials(user.displayName || user.email)}
            </button>

            {/* Plan badge — also clickable to profile */}
            <button
              onClick={onAvatarClick}
              style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                background: planColors[user.plan] + '20',
                color: planColors[user.plan], textTransform: 'uppercase', letterSpacing: '0.05em',
                border: 'none', cursor: 'pointer',
              }}
            >
              {user.plan}
            </button>

            {/* Usage stats — today count */}
            {usage && (
              <span style={{
                fontSize: 10, color: 'var(--text2)', fontWeight: 500,
                borderLeft: '1px solid var(--border)', paddingLeft: 7,
              }}>
                {usage.dailyLimit === null
                  ? <><strong style={{ color: 'var(--text)' }}>{usage.summariesToday}</strong> today</>
                  : <><strong style={{ color: usage.summariesToday >= usage.dailyLimit ? '#dc2626' : 'var(--text)' }}>
                      {usage.summariesToday}/{usage.dailyLimit}
                    </strong> today</>
                }
              </span>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Dark mode toggle */}
        <button onClick={toggleTheme} title="Toggle theme" style={iconBtn}>
          {theme === 'dark' ? '☀' : '◑'}
        </button>

        {/* Sign in button for guests; logged-in users use the avatar */}
        {!user && (
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
