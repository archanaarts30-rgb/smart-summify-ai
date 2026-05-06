import React, { useState } from 'react';
import { socialLogin, emailLogin, emailRegister } from '../lib/firebase';

const PROVIDERS = [
  { id: 'google',   label: 'Google',   color: '#4285F4' },
  { id: 'github',   label: 'GitHub',   color: '#24292e' },
  { id: 'twitter',  label: 'X / Twitter', color: '#000000' },
  { id: 'apple',    label: 'Apple',    color: '#000000' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2' },
  { id: 'yahoo',    label: 'Yahoo',    color: '#720E9E' },
];

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const handleSocial = async (providerId: string) => {
    setError(''); setLoading(providerId);
    try {
      await socialLogin(providerId);
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading('email');
    try {
      if (mode === 'login') await emailLogin(email, password);
      else await emailRegister(email, password);
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '') || 'Auth failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ padding: 20, background: 'var(--bg)', minHeight: 480 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>✦</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Smart Summify AI</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Sign in to start summarizing</p>
      </div>

      {/* Social buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => handleSocial(p.id)}
            disabled={!!loading}
            style={{
              padding: '9px 8px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'var(--bg2)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer', transition: 'all 0.15s',
              opacity: loading === p.id ? 0.7 : 1,
            }}
          >
            {loading === p.id ? '...' : `Continue with ${p.label}`}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>or email</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Email form */}
      <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email address" required
          style={inputStyle}
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password" required minLength={6}
          style={inputStyle}
        />
        {error && <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
        <button type="submit" disabled={!!loading} className="btn" style={{ width: '100%', marginTop: 4 }}>
          {loading === 'email' ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', marginTop: 14 }}>
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <span
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </span>
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: 'var(--bg2)', border: '1px solid var(--border)',
  color: 'var(--text)', outline: 'none', width: '100%',
};
