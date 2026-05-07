const express = require('express');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { authenticate, checkSummaryQuota } = require('../middleware/auth');
const { summarize, summarizeGuest } = require('../services/summarizeService');
const { extractText } = require('../services/documentService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Stricter rate limit for unauthenticated guest summarization: 3 per 24h per IP
const guestRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You have used your 3 free summaries. Sign up for free to continue.' },
  keyGenerator: (req) => req.ip,
});

// ─── Guest summarize (no auth — short summaries only, not logged to DB) ────
router.post('/guest', guestRateLimit, async (req, res) => {
  try {
    const { content, sourceUrl } = req.body;

    if (!content || content.trim().length < 50) {
      return res.status(400).json({ error: 'Content too short to summarize (min 50 characters).' });
    }

    const result = await summarizeGuest({
      content: content.trim(),
      sourceUrl: sourceUrl || null,
    });

    res.json(result);
  } catch (err) {
    console.error('Guest summarize error:', err);
    res.status(500).json({ error: 'Summarization failed. Please try again.' });
  }
});

router.post('/', authenticate, checkSummaryQuota, async (req, res) => {
  try {
    const { content, sourceUrl, size = 'medium' } = req.body;
    const limits = req.planLimits;

    // ─── Validate size is allowed on this plan ─────────────
    if (!limits.sizes_allowed.includes(size)) {
      return res.status(403).json({
        error: `Summary size "${size}" is not available on your plan.`,
        allowed_sizes: limits.sizes_allowed,
        current_plan: req.user.plan,
      });
    }

    if (!content || content.trim().length < 50) {
      return res.status(400).json({ error: 'Content too short to summarize (min 50 characters).' });
    }

    const result = await summarize({
      userId: req.user.id,
      content: content.trim(),
      size,
      sourceUrl: sourceUrl || null,
    });

    res.json(result);
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: 'Summarization failed. Please try again.' });
  }
});

// ─── File upload endpoint ───────────────────────────────────────────
router.post('/file', authenticate, checkSummaryQuota, upload.single('file'), async (req, res) => {
  try {
    const limits = req.planLimits;

    if (!limits.pdf_upload) {
      return res.status(403).json({
        error: 'File upload requires Basic or Premium plan.',
        current_plan: req.user.plan,
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileSizeMb = req.file.size / (1024 * 1024);
    if (fileSizeMb > limits.max_file_mb) {
      return res.status(400).json({
        error: `File exceeds your plan limit of ${limits.max_file_mb}MB.`,
      });
    }

    const { size = 'medium' } = req.body;

    if (!limits.sizes_allowed.includes(size)) {
      return res.status(403).json({
        error: `Summary size "${size}" is not available on your plan.`,
        allowed_sizes: limits.sizes_allowed,
      });
    }

    const content = await extractText(req.file.buffer, req.file.mimetype);

    if (content.length < 50) {
      return res.status(400).json({ error: 'Could not extract enough text from the file.' });
    }

    const result = await summarize({
      userId: req.user.id,
      content,
      size,
      fileName: req.file.originalname,
    });

    res.json(result);
  } catch (err) {
    console.error('File summarize error:', err);
    res.status(500).json({ error: err.message || 'File summarization failed.' });
  }
});

module.exports = router;
