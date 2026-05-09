import React from 'react';
import { useStore } from '../store';

export default function StatsTab() {
  const { user, usage } = useStore();
  const plan = user?.plan || 'free';

  const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  const planLimits: Record<string, { daily: number | null; label: string; color: string }> = {
    free:    { daily: 3,    label: 'Free',    color: '#71717a' },
    basic:   { daily: 20,   label: 'Basic',   color: '#d97706' },
    premium: { daily: null, label: 'Premium', color: '#7c3aed' },
  };
  const planInfo = planLimits[plan] ?? planLimits.free;

  if (!user) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
          Sign in to see your reading stats.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Track every article and document you've summarized.
        </p>
      </div>
    );
  }

  if (!usage) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Summarize something first to start tracking your stats!
      </div>
    );
  }

  const dailyLimit   = planInfo.daily;
  const dailyUsed    = usage.summariesToday;
  const dailyPct     = dailyLimit == null ? 100 : Math.min(100, Math.round((dailyUsed / dailyLimit) * 100));
  const dailyLeft    = dailyLimit == null ? null : dailyLimit - dailyUsed;
  const barColor     = dailyLimit == null ? '#16a34a'
    : dailyPct >= 90 ? '#dc2626'
    : dailyPct >= 65 ? '#d97706'
    : '#7c3aed';

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>
        📊 Your Reading Stats
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px' }}>
        A summary of every article and document you've read using Smart Summify AI.
      </p>

      {/* ── Today ── */}
      <div style={{
        padding: '13px 14px', borderRadius: 'var(--radius-lg)',
        background: 'var(--bg2)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              📅 Today
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {dailyUsed === 0
                ? "You haven't summarized anything today yet."
                : dailyUsed === 1
                  ? 'You summarized 1 article today.'
                  : `You summarized ${dailyUsed} articles today.`}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: barColor, lineHeight: 1 }}>
              {dailyUsed}
              {dailyLimit !== null && <span style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 500 }}>/{dailyLimit}</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
              {dailyLimit == null ? 'unlimited' : `${dailyLeft} left`}
            </div>
          </div>
        </div>

        {dailyLimit !== null && (
          <>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${dailyPct}%`, background: barColor, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              {dailyLeft === 0
                ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Daily limit reached. Resets at midnight.</span>
                : dailyLeft === 1
                  ? '1 summary remaining today. Resets at midnight.'
                  : `${dailyLeft} summaries remaining today. Resets at midnight.`}
            </div>
          </>
        )}
        {dailyLimit === null && (
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            ✓ Unlimited daily summaries on your {planInfo.label} plan
          </div>
        )}
      </div>

      {/* ── This month ── */}
      <div style={{
        padding: '13px 14px', borderRadius: 'var(--radius-lg)',
        background: 'var(--bg2)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              📆 {monthName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {usage.summariesThisMonth === 0
                ? 'No summaries this month yet.'
                : usage.summariesThisMonth === 1
                  ? 'You summarized 1 article this month.'
                  : `You summarized ${usage.summariesThisMonth} articles this month.`}
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', marginLeft: 10 }}>
            {usage.summariesThisMonth}
          </div>
        </div>
      </div>

      {/* ── All time ── */}
      <div style={{
        padding: '13px 14px', borderRadius: 'var(--radius-lg)',
        background: 'var(--bg2)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              🏆 All Time
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {usage.totalSummaries === 0
                ? "You haven't summarized anything yet."
                : usage.totalSummaries === 1
                  ? 'You\'ve summarized 1 article in total since joining.'
                  : `You've summarized ${usage.totalSummaries} articles in total since joining.`}
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', marginLeft: 10 }}>
            {usage.totalSummaries}
          </div>
        </div>
      </div>

      {/* ── Plan info ── */}
      <div style={{
        padding: '10px 14px', borderRadius: 'var(--radius-lg)',
        background: planInfo.color + '10',
        border: `1px solid ${planInfo.color}35`,
        fontSize: 12,
      }}>
        <span style={{ fontWeight: 700, color: planInfo.color }}>
          {planInfo.label} Plan
        </span>
        <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
          {dailyLimit == null
            ? '· Unlimited summaries per day'
            : `· Up to ${dailyLimit} summaries per day`}
          {plan === 'free' && ' · Short summaries only'}
        </span>
        {plan === 'free' && (
          <div style={{ marginTop: 5, color: 'var(--text2)' }}>
            Upgrade to <strong style={{ color: '#d97706' }}>Basic</strong> for 20/day with Medium & Full summaries,
            or <strong style={{ color: '#7c3aed' }}>Premium</strong> for unlimited.
          </div>
        )}
      </div>
    </div>
  );
}
