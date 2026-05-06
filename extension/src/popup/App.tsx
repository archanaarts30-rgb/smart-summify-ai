import React, { useEffect, useState } from 'react';
import { onAuthChange } from '../lib/firebase';
import { useStore } from '../store';
import AuthScreen from '../components/AuthScreen';
import SummaryTab from '../components/SummaryTab';
import ChatTab from '../components/ChatTab';
import ExportTab from '../components/ExportTab';
import HistoryTab from '../components/HistoryTab';
import Header from '../components/Header';

type Tab = 'summary' | 'chat' | 'export' | 'history';

export default function App() {
  const { user, setUser, clearUser, theme, fontSize } = useStore();
  const [tab, setTab] = useState<Tab>('summary');
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch full profile from backend (plan info etc.)
        try {
          const token = await firebaseUser.getIdToken();
          const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          }
        } catch (e) {
          setUser({ id: '', email: firebaseUser.email || '', displayName: firebaseUser.displayName || '', plan: 'free' });
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

  if (!user) return <AuthScreen />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summarize' },
    { id: 'chat', label: 'Chat' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div data-theme={theme} style={{ '--font-size-base': `${fontSize}px` } as React.CSSProperties}>
      <Header />

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
      <div style={{ background: 'var(--bg)', minHeight: 400 }}>
        {tab === 'summary' && <SummaryTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'export' && <ExportTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
