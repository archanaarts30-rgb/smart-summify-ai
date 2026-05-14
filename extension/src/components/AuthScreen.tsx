import React, { useState } from 'react';
import { socialLogin, emailLogin, emailRegister } from '../lib/firebase';
import { useStore, GUEST_FREE_LIMIT } from '../store';

interface AuthScreenProps {
  onClose?: () => void;
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.707 17.64 9.2z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
);

export default function AuthScreen({ onClose }: AuthScreenProps) {
  const { guestSummaryCount } = useStore();
  const limitHit = guestSummaryCount >= GUEST_FREE_LIMIT;

  const [mode, setMode] = useState<'login' | 'register'>(limitHit ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(''); setLoading('google');
    try {
      await socialLogin('google');
    } catch (e: any) {
      setError(e.message || 'Google sign-in failed');
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading('email');
    try {
      if (mode === 'login') {
        await emailLogin(email, password);
      } else {
        await emailRegister(email, password);
      }
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '').replace(/\(auth\/.*?\)\.?/, '').trim() || 'Authentication failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
      }}>
        {onClose ? (
          <button onClick={onClose} style={backBtn}>
            <span style={{ fontSize: 16, marginRight: 4 }}>←</span> Back
          </button>
        ) : <div />}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Smart Summify AI</span>
        <div style={{ width: 56 }} />
      </div>

      <div style={{ flex: 1, padding: '16px 20px 20px', display: 'flex', flexDirection: 'column' }}>

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>

          {limitHit ? (
            <div style={{
              margin: '10px 0 0', padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, fontSize: 13, color: '#dc2626', lineHeight: 1.5,
            }}>
              You've used your <strong>{GUEST_FREE_LIMIT} free summaries</strong>.
              Sign up free to get 3/day and save your history.
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
              {mode === 'login' ? (
                'Sign in to access your summaries and history.'
              ) : (
                <strong style={{ color: 'var(--text)', fontWeight: 700 }}>
                  Free account · 3 summaries/day · No credit card needed.
                </strong>
              )}
            </p>
          )}
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={loading === 'google'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '11px 16px', borderRadius: 10, fontSize: 14,
            fontWeight: 600, cursor: loading === 'google' ? 'wait' : 'pointer',
            background: 'var(--bg)', border: '1.5px solid var(--border)',
            color: 'var(--text)', transition: 'all 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            opacity: loading === 'google' ? 0.7 : 1,
          }}
        >
          {loading === 'google' ? (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Connecting…</span>
          ) : (
            <><GoogleIcon /> Continue with Google</>
          )}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Mode toggle tabs */}
        <div style={{
          display: 'flex', background: 'var(--bg2)', borderRadius: 10,
          padding: 3, marginBottom: 18, gap: 2,
        }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '7px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: mode === m ? 'var(--bg)' : 'transparent',
                color: mode === m ? 'var(--accent)' : 'var(--text2)',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Email form */}
        <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <div style={fieldWrap}>
              <label style={labelStyle}>Display name</label>
              <input
                type="text" value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
          )}

          <div style={fieldWrap}>
            <label style={labelStyle}>Email</label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Min 6 characters' : '••••••••'}
              required minLength={6}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 8, fontSize: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#dc2626', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!!loading}
            style={{
              marginTop: 2, padding: '11px 16px', borderRadius: 10, fontSize: 14,
              fontWeight: 700, border: 'none', cursor: loading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', transition: 'opacity 0.15s',
              opacity: loading === 'email' ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
            }}
          >
            {loading === 'email'
              ? 'Please wait…'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text2)', marginTop: 18, lineHeight: 1.6 }}>
          By continuing you agree to our{' '}
          <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>Terms</span>
          {' '}and{' '}
          <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 2,
  background: 'transparent', border: 'none',
  fontSize: 13, color: 'var(--text2)', cursor: 'pointer',
  padding: '4px 6px', borderRadius: 6, fontWeight: 500,
};

const fieldWrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.02em',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, fontSize: 13,
  background: 'var(--bg2)', border: '1.5px solid var(--border)',
  color: 'var(--text)', outline: 'none', width: '100%',
  transition: 'border-color 0.15s',
};
