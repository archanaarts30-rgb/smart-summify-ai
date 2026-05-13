import React from 'react';
import { useStore } from '../store';
import FeedbackIcon from '../icons/FeedbackIcon';
import MoonIcon from '../icons/MoonIcon';
import SunIcon from '../icons/SunIcon';

interface HeaderProps {
  onSignInClick: () => void;
  onAvatarClick?: () => void;
  feedbackOpen?: boolean;
  onFeedbackClick?: () => void;
}

export default function Header({ onSignInClick, onAvatarClick, feedbackOpen, onFeedbackClick }: HeaderProps) {
  const { user, theme, toggleTheme } = useStore();

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
        <span style={{
          fontFamily: '"Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 600,
          fontSize: Math.round(15 * 1.2),
          background: 'linear-gradient(135deg, #6d4af7 0%, #9580ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Smart Summify AI</span>
        {user && (
          <>
            {/* Clickable avatar — opens profile page */}
            <button
              onClick={onAvatarClick}
              title="View profile & billing"
              style={{
                width: Math.round(28 * 0.8), height: Math.round(28 * 0.8), borderRadius: '50%',
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

          </>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={onFeedbackClick}
          title="Send feedback"
          aria-expanded={feedbackOpen}
          aria-label="Send feedback"
          style={{
            ...iconBtn,
            ...(feedbackOpen
              ? { background: 'rgba(109, 74, 247, 0.12)' }
              : {}),
          }}
        >
          <FeedbackIcon size={24} />
        </button>

        {/* Dark mode toggle: moon → switch to dark, sun → switch to light */}
        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Dark mode on, switch to light' : 'Light mode on, switch to dark'}
          style={iconBtn}
        >
          {theme === 'dark' ? <SunIcon size={24} /> : <MoonIcon size={24} />}
        </button>

        {/* Sign in button for guests; logged-in users use the avatar */}
        {!user && (
          <button
            onClick={onSignInClick}
            title="Sign in"
            style={{
              ...iconBtn,
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
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
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none',
  borderRadius: 6, padding: '3px 7px', fontSize: 12,
  color: 'var(--text2)', cursor: 'pointer', fontWeight: 600,
};
