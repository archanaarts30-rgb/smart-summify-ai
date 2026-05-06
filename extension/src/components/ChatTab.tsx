import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { sendChatMessage } from '../lib/api';

export default function ChatTab() {
  const { user, currentSummary, chatHistory, addChatMessage } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const plan = user?.plan || 'free';
  const canChat = plan !== 'free';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const send = async () => {
    if (!input.trim() || !currentSummary || loading) return;
    const userMsg = input.trim();
    setInput(''); setError('');
    addChatMessage({ role: 'user', content: userMsg });
    setLoading(true);
    try {
      const { reply } = await sendChatMessage(currentSummary.summaryId, userMsg, chatHistory);
      addChatMessage({ role: 'assistant', content: reply });
    } catch (e: any) {
      setError(e.message || 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  if (!canChat) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
        <p style={{ fontSize: 13, marginBottom: 12 }}>Chat with content requires <strong>Basic</strong> or <strong>Premium</strong> plan.</p>
        <button
          className="btn"
          onClick={() => chrome.tabs.create({ url: 'https://smartsummify.app/upgrade' })}
        >
          Upgrade to unlock
        </button>
      </div>
    );
  }

  if (!currentSummary) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Summarize a page first, then come back to chat about it.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 440 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chatHistory.length === 0 && (
          <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
            Ask anything about this page's content...
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <div key={i} style={{
            maxWidth: '85%', padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg2)',
            color: msg.role === 'user' ? '#fff' : 'var(--text)',
            border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '9px 12px', borderRadius: 10,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            fontSize: 13, color: 'var(--text2)',
          }}>
            Thinking...
          </div>
        )}
        {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask a question about this content..."
          disabled={loading}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--text)', outline: 'none',
          }}
        />
        <button onClick={send} disabled={loading || !input.trim()} className="btn" style={{ padding: '8px 14px' }}>
          ↑
        </button>
      </div>
    </div>
  );
}
