import React, { useState } from 'react';
import { useStore } from '../store';
import { updateProfile, subscribe, openBillingPortal } from '../lib/api';
import { logout } from '../lib/firebase';

type InnerTab = 'profile' | 'billing';

interface ProfilePageProps {
  onBack: () => void;
  /** When opening Account from an upgrade prompt, land on Plan & Billing */
  initialInnerTab?: InnerTab;
}

const PLAN_CONFIG = {
  free: {
    label: 'Free',
    price: '$0',
    period: 'forever',
    color: '#71717a',
    gradient: 'linear-gradient(135deg, #71717a, #a1a1aa)',
    features: [
      '3 summaries per day',
      'Short summaries only',
      'Page summarization',
      '1 document upload per day (PDF, Word, ≤10 MB)',
      'Copy to clipboard',
      'Text-to-speech (listen)',
    ],
    missing: [
      'Medium & Full summaries',
      'Export to PDF / Word / Text',
      'Chat with content',
      'Social media images',
      'Presentation slides',
    ],
  },
  basic: {
    label: 'Basic',
    price: '$4.99',
    period: 'per month',
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
    features: [
      '30 summaries per day',
      'Short, Medium & Full summaries',
      'File upload (PDF, Word, ≤10 MB)',
      'Export to PDF / Word / Text',
      'Chat with content',
      'Copy & Text-to-speech',
      'All Free features',
    ],
    missing: [
      'Social media image generation',
      'Presentation slide creation',
    ],
  },
  premium: {
    label: 'Premium',
    price: '$8.99',
    period: 'per month',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    features: [
      'Unlimited summaries',
      'Short, Medium & Full summaries',
      'File upload (PDF, Word, ≤50 MB)',
      'Export to PDF / Word / Text',
      'Chat with content',
      'Social media image generation',
      'Presentation slide creation',
      'Priority AI processing',
      'All Basic features',
    ],
    missing: [],
  },
} as const;

type PlanKey = keyof typeof PLAN_CONFIG;

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function ProfilePage({ onBack, initialInnerTab = 'profile' }: ProfilePageProps) {
  const { user, setUser, clearUser } = useStore();
  const [innerTab, setInnerTab] = useState<InnerTab>(initialInnerTab);

  // Profile tab state
  const nameParts = (user?.displayName || '').trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName,  setLastName]  = useState(nameParts.slice(1).join(' ') || '');
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');

  // Billing tab state
  const [upgrading, setUpgrading] = useState<PlanKey | null>(null);
  const [billingError, setBillingError] = useState('');

  const currentPlan = (user?.plan || 'free') as PlanKey;
  const planRank: Record<PlanKey, number> = { free: 0, basic: 1, premium: 2 };

  const handleSaveProfile = async () => {
    const newName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    if (!newName) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await updateProfile(newName);
      setUser({ ...user!, displayName: newName });
      setSaveMsg('Saved!');
    } catch (e: any) {
      setSaveMsg(e.message || 'Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const handleUpgrade = async (plan: 'basic' | 'premium') => {
    setUpgrading(plan);
    setBillingError('');
    try {
      const { checkoutUrl } = await subscribe(plan);
      if (checkoutUrl) chrome.tabs.create({ url: checkoutUrl });
    } catch (e: any) {
      setBillingError(e.message || 'Could not start checkout. Please try again.');
    } finally {
      setUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    setUpgrading('free');
    setBillingError('');
    try {
      const { portalUrl } = await openBillingPortal();
      if (portalUrl) chrome.tabs.create({ url: portalUrl });
    } catch (e: any) {
      setBillingError(e.message || 'Could not open billing portal.');
    } finally {
      setUpgrading(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    clearUser();
    onBack();
  };

  const cfg = PLAN_CONFIG[currentPlan];

  return (
    <div style={{ background: 'var(--bg)', minHeight: 500, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 7, padding: '4px 10px', fontSize: 12,
            color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← Back
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Account</span>
      </div>

      {/* ── Avatar + name hero ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '18px 20px 14px',
        background: `linear-gradient(160deg, ${cfg.color}18 0%, transparent 60%)`,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: cfg.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: '#fff',
          boxShadow: `0 3px 11px ${cfg.color}50`,
          marginBottom: 8,
        }}>
          {getInitials(user?.displayName || user?.email || '?')}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 3 }}>
          {user?.displayName || 'Guest User'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          {user?.email}
        </div>
        <span style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700,
          padding: '3px 12px', borderRadius: 20,
          background: cfg.color + '20', color: cfg.color,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {cfg.label} Plan
        </span>
      </div>

      {/* ── Inner tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['profile', 'billing'] as InnerTab[]).map(t => (
          <button
            key={t}
            onClick={() => setInnerTab(t)}
            style={{
              flex: 1, padding: '9px 4px', fontSize: 13,
              fontWeight: innerTab === t ? 600 : 400,
              color: innerTab === t ? 'var(--accent)' : 'var(--text2)',
              background: 'transparent', border: 'none',
              borderBottom: innerTab === t ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {t === 'profile' ? 'Profile' : 'Plan & Billing'}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {innerTab === 'profile' && (
        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>First name</label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First name"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Last name</label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last name"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              value={user?.email || ''}
              disabled
              style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="btn"
              style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700 }}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saveMsg && (
              <span style={{
                fontSize: 12, textAlign: 'center',
                color: saveMsg === 'Saved!' ? 'var(--success)' : 'var(--danger)',
                fontWeight: 600,
              }}>
                {saveMsg}
              </span>
            )}
          </div>

          <div style={{
            marginTop: 8, paddingTop: 16,
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'transparent', border: '1px solid var(--danger)',
                color: 'var(--danger)', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── Billing tab ── */}
      {innerTab === 'billing' && (
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {billingError && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--danger)',
            }}>
              {billingError}
            </div>
          )}

          {(Object.entries(PLAN_CONFIG) as [PlanKey, typeof PLAN_CONFIG[PlanKey]][]).map(([key, plan]) => {
            const isCurrent = key === currentPlan;
            const isHigher  = planRank[key] > planRank[currentPlan];
            const isLower   = planRank[key] < planRank[currentPlan];

            return (
              <div
                key={key}
                style={{
                  borderRadius: 12, padding: '14px 16px',
                  border: isCurrent
                    ? `2px solid ${plan.color}`
                    : '1px solid var(--border)',
                  background: isCurrent ? plan.color + '08' : 'var(--bg2)',
                  position: 'relative',
                }}
              >
                {/* Plan header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span style={{
                        fontWeight: 800, fontSize: 15,
                        background: plan.gradient,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                        {plan.label}
                      </span>
                      {isCurrent && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px',
                          borderRadius: 10, background: plan.color,
                          color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          Current
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
                        {plan.price}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{plan.period}</span>
                    </div>
                  </div>

                  {/* Action button */}
                  {isCurrent ? (
                    key !== 'free' ? (
                      <button
                        onClick={handleManageBilling}
                        disabled={upgrading !== null}
                        style={{
                          ...planBtnStyle,
                          background: 'transparent',
                          border: `1px solid ${plan.color}`,
                          color: plan.color,
                        }}
                      >
                        {upgrading === 'free' ? '...' : 'Manage'}
                      </button>
                    ) : null
                  ) : isHigher ? (
                    <button
                      onClick={() => key !== 'free' && handleUpgrade(key)}
                      disabled={upgrading !== null}
                      style={{
                        ...planBtnStyle,
                        background: plan.gradient,
                        border: 'none',
                        color: '#fff',
                      }}
                    >
                      {upgrading === key ? 'Loading...' : 'Upgrade'}
                    </button>
                  ) : isLower ? (
                    <button
                      onClick={handleManageBilling}
                      disabled={upgrading !== null}
                      style={{
                        ...planBtnStyle,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text2)',
                      }}
                    >
                      {upgrading === 'free' ? '...' : 'Downgrade'}
                    </button>
                  ) : null}
                </div>

                {/* Features list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text)' }}>
                      <span style={{ color: plan.color, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                  {'missing' in plan && plan.missing.map((f: string) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text2)', opacity: 0.6 }}>
                      <span style={{ fontSize: 11, flexShrink: 0 }}>✗</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', marginTop: 4 }}>
            Payments are securely handled by Stripe. Cancel anytime.
          </p>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
};

const planBtnStyle: React.CSSProperties = {
  padding: '6px 13px', borderRadius: 7, fontSize: 12,
  fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  transition: 'opacity 0.15s',
};
