const express = require('express');
const { authenticate, PLAN_LIMITS } = require('../middleware/auth');
const supabase = require('../config/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// ─── Get current user profile + usage ──────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

  const [{ count: summariesToday }, { count: summariesThisMonth }, { count: totalSummaries }] =
    await Promise.all([
      supabase
        .from('summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .gte('created_at', `${today}T00:00:00Z`),
      supabase
        .from('summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .gte('created_at', monthStart),
      supabase
        .from('summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id),
    ]);

  const limits = PLAN_LIMITS[req.user.plan];

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.display_name,
      plan: req.user.plan,
      createdAt: req.user.created_at,
    },
    usage: {
      summariesToday,
      summariesThisMonth,
      totalSummaries,
      dailyLimit:   limits.summaries_per_day === Infinity ? null : limits.summaries_per_day,
      monthlyLimit: null, // all plans are daily-limited, not monthly-capped
    },
    limits,
  });
});

// ─── Update display name ────────────────────────────────────────────
router.patch('/me', authenticate, async (req, res) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Display name is required.' });
  }
  const sanitized = displayName.trim().replace(/<[^>]*>/g, ''); // strip any HTML tags
  if (sanitized.length < 2) {
    return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
  }
  if (sanitized.length > 100) {
    return res.status(400).json({ error: 'Display name must be 100 characters or fewer.' });
  }

  const { error } = await supabase
    .from('users')
    .update({ display_name: sanitized })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: 'Update failed.' });
  res.json({ success: true });
});

// ─── Create Stripe Checkout session ────────────────────────────────
router.post('/subscribe', authenticate, async (req, res) => {
  const { plan } = req.body;

  // Guard: Stripe must be configured
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payments are not configured yet. Please contact support.' });
  }

  const priceId = plan === 'premium'
    ? process.env.STRIPE_PREMIUM_PRICE_ID
    : process.env.STRIPE_BASIC_PRICE_ID;

  if (!priceId) {
    const missing = plan === 'premium' ? 'STRIPE_PREMIUM_PRICE_ID' : 'STRIPE_BASIC_PRICE_ID';
    console.error(`[subscribe] Missing env var: ${missing}`);
    return res.status(503).json({ error: 'This plan is not available yet. Please contact support.' });
  }

  try {
    let customerId = req.user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { firebase_uid: req.user.firebase_uid, supabase_id: req.user.id },
      });
      customerId = customer.id;
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', req.user.id);
    }

    // Resolve own public URL: Railway injects RAILWAY_PUBLIC_DOMAIN automatically.
    const backendUrl = process.env.BACKEND_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : null)
      || `https://smart-summify-ai-development.up.railway.app`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // Hosted Checkout shows “Add promotion code” (collapsed link under order summary)—Dashboard coupons alone don’t enable this.
      allow_promotion_codes: true,
      success_url: `${backendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${backendUrl}/payment/cancel`,
    });

    console.log('[subscribe] Checkout Session', session.id, 'allow_promotion_codes=', session.allow_promotion_codes);

    res.json({ checkoutUrl: session.url, checkoutSessionId: session.id });
  } catch (err) {
    // Surface the real Stripe error message to make debugging easier
    const stripeMsg = err?.raw?.message || err?.message || 'Unknown error';
    console.error('[subscribe] Stripe error:', stripeMsg, err);
    res.status(500).json({ error: `Stripe: ${stripeMsg}` });
  }
});

// ─── Open Stripe Customer Portal ────────────────────────────────────
router.post('/billing-portal', authenticate, async (req, res) => {
  if (!req.user.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found.' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: process.env.FRONTEND_ORIGIN,
    });
    res.json({ portalUrl: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Could not open billing portal.' });
  }
});

// ─── Summary history ────────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('summaries')
    .select('id, source_url, file_name, size_requested, summary_word_count, time_saved_sec, created_at', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) return res.status(500).json({ error: 'Could not load history.' });
  res.json({ summaries: data, total: count, page, totalPages: Math.ceil(count / limit) });
});

module.exports = router;
