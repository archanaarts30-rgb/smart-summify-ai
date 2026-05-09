require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const summarizeRouter = require('./routes/summarize');
const chatRouter = require('./routes/chat');
const exportRouter = require('./routes/export');
const socialRouter = require('./routes/social');
const slidesRouter = require('./routes/slides');
const usersRouter = require('./routes/users');
const stripeRouter = require('./routes/stripe');

const app = express();

// ─── Trust Railway / cloud proxy so req.ip = real client IP ───────
// Required for rate limiters keyed on req.ip to work correctly.
app.set('trust proxy', 1);

// ─── Security headers ──────────────────────────────────────────────
app.use(helmet());

// ─── CORS: allow only our Chrome extension + localhost dev ─────────
const ALLOWED_EXTENSION_ID = process.env.CHROME_EXTENSION_ID; // set in Railway
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / health checks
    if (origin === 'http://localhost:3000') return cb(null, true);
    if (origin === process.env.FRONTEND_ORIGIN) return cb(null, true);
    // Restrict to our specific extension ID when the env var is set;
    // fall back to allowing any chrome-extension:// origin in development.
    if (origin.startsWith('chrome-extension://')) {
      if (!ALLOWED_EXTENSION_ID || origin === `chrome-extension://${ALLOWED_EXTENSION_ID}`) {
        return cb(null, true);
      }
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── Stripe webhook needs raw body — mount BEFORE json parser ──────
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeRouter);

// ─── JSON body parser ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── Global rate limiter ───────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
}));

// ─── Routes ────────────────────────────────────────────────────────
app.use('/v1/summarize', summarizeRouter);
app.use('/v1/chat', chatRouter);
app.use('/v1/export', exportRouter);
app.use('/v1/social-images', socialRouter);
app.use('/v1/slides', slidesRouter);
app.use('/v1/users', usersRouter);

// ─── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Stripe payment result pages ───────────────────────────────────
// These are opened in a browser tab after Stripe Checkout completes.
// The user closes the tab and returns to the extension.
app.get('/payment/success', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Payment successful — Smart Summify AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f0fdf4; }
    .card { text-align: center; padding: 48px 40px; background: #fff;
            border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #15803d; margin: 0 0 10px; }
    p  { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    button { background: #16a34a; color: #fff; border: none; padding: 12px 28px;
             border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style></head><body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Payment successful!</h1>
    <p>Your plan has been upgraded. Open the Smart Summify AI extension to start using your new features.</p>
    <button onclick="window.close()">Close this tab</button>
  </div>
  </body></html>`);
});

app.get('/payment/cancel', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Payment cancelled — Smart Summify AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #fafafa; }
    .card { text-align: center; padding: 48px 40px; background: #fff;
            border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #374151; margin: 0 0 10px; }
    p  { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    button { background: #6366f1; color: #fff; border: none; padding: 12px 28px;
             border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style></head><body>
  <div class="card">
    <div class="icon">↩</div>
    <h1>Payment cancelled</h1>
    <p>No charges were made. You can upgrade anytime from the Smart Summify AI extension.</p>
    <button onclick="window.close()">Close this tab</button>
  </div>
  </body></html>`);
});

// ─── DB validation (dev/staging only, secret-key protected) ────────
// Access: GET /health/db?secret=<HEALTH_CHECK_SECRET>
if (process.env.NODE_ENV !== 'production') {
  app.get('/health/db', async (req, res) => {
    const secret = process.env.HEALTH_CHECK_SECRET;
    if (secret && req.query.secret !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const supabase = require('./config/supabase');
    const results = {};

    // Check URL format
    const rawUrl = process.env.SUPABASE_URL || '';
    // Omit actual URL value from response to avoid leaking secrets
    results.supabase_url_check = {
      value: rawUrl ? '[set]' : '[missing]',
      has_trailing_slash: rawUrl.endsWith('/'),
      has_extra_path: rawUrl.includes('/rest') || rawUrl.includes('/v1'),
      looks_correct: rawUrl.startsWith('https://') && !rawUrl.endsWith('/') && !rawUrl.includes('/rest'),
    };

    // Check service role key format (decode JWT payload without a library)
    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    try {
      const parts = rawKey.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      results.key_check = {
        has_leading_space:  rawKey.startsWith(' ') || rawKey.startsWith('\n'),
        has_trailing_space: rawKey.endsWith(' ')   || rawKey.endsWith('\n'),
        part_count: parts.length,           // must be 3
        role_ok: payload.role === 'service_role',
        issuer_ok: payload.iss === 'supabase',
        key_length: rawKey.length,
      };
    } catch {
      results.key_check = { error: 'Could not decode JWT — key is malformed or truncated', key_length: rawKey.length };
    }

    try {
      // 1 — Insert test user
      const testUid = `test-uid-${Date.now()}`;
      const { data: user, error: userErr } = await supabase
        .from('users')
        .insert({
          firebase_uid: testUid,
          email: 'db-validate@smartsummify.test',
          display_name: 'DB Validation User',
          plan: 'free',
        })
        .select()
        .single();

      if (userErr) {
        results.users = { ok: false, error: userErr.message, code: userErr.code };
        return res.status(500).json({ ok: false, results });
      }
      results.users = { ok: true, inserted_id: user.id };

      // 2 — Insert test summary linked to that user
      const { data: summary, error: sumErr } = await supabase
        .from('summaries')
        .insert({
          user_id: user.id,
          source_url: 'https://example.com/test',
          summary_text: 'This is a database validation test summary.',
          size_requested: 'small',
          input_tokens: 10,
          output_tokens: 5,
          original_word_count: 100,
          summary_word_count: 10,
          original_read_sec: 25,
          summary_read_sec: 3,
          time_saved_sec: 22,
          duration_ms: 500,
        })
        .select()
        .single();

      if (sumErr) {
        results.summaries = { ok: false, error: sumErr.message, code: sumErr.code };
        await supabase.from('users').delete().eq('id', user.id);
        return res.status(500).json({ ok: false, results });
      }
      results.summaries = { ok: true, inserted_id: summary.id };

      // 3 — Read back both rows
      const { data: readUser } = await supabase.from('users').select('id,email,plan').eq('id', user.id).single();
      const { data: readSum }  = await supabase.from('summaries').select('id,summary_text').eq('id', summary.id).single();
      results.read_back = {
        user:    readUser  ? { ok: true, ...readUser }  : { ok: false },
        summary: readSum   ? { ok: true, ...readSum }   : { ok: false },
      };

      // 4 — Clean up (cascade delete removes the summary too)
      await supabase.from('users').delete().eq('id', user.id);
      results.cleanup = { ok: true };

      return res.json({ ok: true, results });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message, results });
    }
  });
}

// ─── Global error handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Smart Summify backend running on port ${PORT}`));
