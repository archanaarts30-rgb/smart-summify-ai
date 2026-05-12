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

// ─── Global error handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Smart Summify backend running on port ${PORT}`));
