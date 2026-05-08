const express = require('express');
const { authenticate, PLAN_LIMITS } = require('../middleware/auth');
const supabase = require('../config/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// ─── Get current user profile + usage ──────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const { count: summariesToday } = await supabase
    .from('summaries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .gte('created_at', `${today}T00:00:00Z`);

  const { count: totalSummaries } = await supabase
    .from('summaries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id);

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
      totalSummaries,
      dailyLimit: limits.summaries_per_day === Infinity ? null : limits.summaries_per_day,
    },
    limits,
  });
});

// ─── Update display name ────────────────────────────────────────────
router.patch('/me', authenticate, async (req, res) => {
  const { displayName } = req.body;
  if (!displayName || displayName.trim().length < 2) {
    return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
  }

  const { error } = await supabase
    .from('users')
    .update({ display_name: displayName.trim() })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: 'Update failed.' });
  res.json({ success: true });
});

// ─── Create Stripe Checkout session ────────────────────────────────
router.post('/subscribe', authenticate, async (req, res) => {
  const { plan } = req.body;
  const priceId = plan === 'premium'
    ? process.env.STRIPE_PREMIUM_PRICE_ID
    : process.env.STRIPE_BASIC_PRICE_ID;

  if (!priceId) return res.status(400).json({ error: 'Invalid plan.' });

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

    // Resolve own public URL: prefer explicit override, then Railway's auto-injected
    // RAILWAY_PUBLIC_DOMAIN, then fall back to the dev Railway service URL.
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
      success_url: `${backendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${backendUrl}/payment/cancel`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Could not create checkout session.' });
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
