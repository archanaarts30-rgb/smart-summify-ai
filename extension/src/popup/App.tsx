import React, { useEffect, useState } from 'react';
import { onAuthChange } from '../lib/firebase';
import { useStore } from '../store';
import AuthScreen from '../components/AuthScreen';
import SummaryTab from '../components/SummaryTab';
import HistoryTab from '../components/HistoryTab';
import Header from '../components/Header';
import ProfilePage from '../components/ProfilePage';

type Tab = 'summary' | 'history';
type View = 'main' | 'profile';

export default function App() {
  const { user, setUser, clearUser, setUsage, theme, fontSize, showAuthModal, setShowAuthModal } = useStore();
  const [tab, setTab] = useState<Tab>('summary');
  const [view, setView] = useState<View>('main');
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const fallbackUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          plan: 'free' as const,
        };
        try {
          const token = await firebaseUser.getIdToken();
          const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setUsage(data.usage ?? null);
          } else {
            setUser(fallbackUser);
          }
        } catch {
          setUser(fallbackUser);
        }
      } else {
        clearUser();
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text2)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summarize' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div data-theme={theme} style={{ '--font-size-base': `${fontSize}px` } as React.CSSProperties}>

      {/* ── Profile view ── */}
      {view === 'profile' && (
        <ProfilePage onBack={() => setView('main')} />
      )}

      {/* ── Main view ── */}
      {view === 'main' && (
        <>
          <Header
            onSignInClick={() => setShowAuthModal(true)}
            onAvatarClick={() => setView('profile')}
          />

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '10px 4px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? 'var(--accent)' : 'var(--text2)',
                  background: 'transparent', border: 'none',
                  borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ background: 'var(--bg)' }}>
            {tab === 'summary' && <SummaryTab />}
            {tab === 'history' && <HistoryTab />}
          </div>
        </>
      )}

      {/* Auth modal overlay — shown when guest hits limit or clicks Sign In */}
      {showAuthModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: '100%', maxHeight: '100%', overflowY: 'auto' }}>
            <AuthScreen onClose={() => setShowAuthModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
