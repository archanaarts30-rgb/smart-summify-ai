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

// ─── Security headers ──────────────────────────────────────────────
app.use(helmet());

// ─── CORS: allow Chrome extension ─────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      process.env.FRONTEND_ORIGIN,
      'http://localhost:3000',
    ];
    if (!origin || allowed.includes(origin) || (origin && origin.startsWith('chrome-extension://'))) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
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

// ─── DB validation (development only) ─────────────────────────────
// Inserts a test user + summary, verifies them, then deletes both.
// Remove this endpoint before going to production.
if (process.env.NODE_ENV !== 'production') {
  app.get('/health/db', async (_req, res) => {
    const supabase = require('./config/supabase');
    const results = {};

    // Show the configured URL (no key) so we can spot formatting issues
    const rawUrl = process.env.SUPABASE_URL || '';
    results.supabase_url_check = {
      value: rawUrl,
      has_trailing_slash: rawUrl.endsWith('/'),
      has_extra_path: rawUrl.includes('/rest') || rawUrl.includes('/v1'),
      looks_correct: rawUrl.startsWith('https://') && !rawUrl.endsWith('/') && !rawUrl.includes('/rest'),
    };

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
