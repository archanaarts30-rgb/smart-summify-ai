import React, { useState } from 'react';
import { useStore } from '../store';
import { submitFeedback } from '../lib/api';

type Cat = 'general' | 'bug' | 'feature' | 'billing';

interface Props {
  onClose: () => void;
  onRequireAuth: () => void;
}

export default function FeedbackPanel({ onClose, onRequireAuth }: Props) {
  const user = useStore(s => s.user);
  const [category, setCategory] = useState<Cat>('general');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const extVersion =
    typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version
      ? chrome.runtime.getManifest().version
      : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await submitFeedback({ category, message: message.trim(), extensionVersion: extVersion });
      setDone(true);
      setMessage('');
      window.setTimeout(() => {
        setDone(false);
        onClose();
      }, 1400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 10px', lineHeight: 1.45 }}>
          Sign in to send feedback or report an issue.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button
            type="button"
            onClick={() => { onRequireAuth(); onClose(); }}
            style={primaryBtn}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg2)',
    }}>
      {done ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          Thanks — we received your feedback.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Topic
          </label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as Cat)}
            style={{
              width: '100%', marginBottom: 10, padding: '8px 10px', fontSize: 12,
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
            }}
          >
            <option value="general">General</option>
            <option value="bug">Bug</option>
            <option value="feature">Feature idea</option>
            <option value="billing">Billing</option>
          </select>
          <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Your message
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Tell us what went wrong or what we could improve..."
            rows={4}
            maxLength={4000}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 88,
              padding: '10px 12px', fontSize: 12, lineHeight: 1.45,
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
              marginBottom: 8,
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>{message.length} / 4000</div>
          {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
            <button
              type="submit"
              disabled={loading || message.trim().length < 3}
              style={{
                ...primaryBtn,
                opacity: loading || message.trim().length < 3 ? 0.55 : 1,
                cursor: loading || message.trim().length < 3 ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text2)',
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 700,
  color: '#fff',
  cursor: 'pointer',
};
