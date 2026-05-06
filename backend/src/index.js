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

// ─── Global error handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Smart Summify backend running on port ${PORT}`));
