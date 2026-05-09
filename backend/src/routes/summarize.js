const express = require('express');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { authenticate, checkSummaryQuota } = require('../middleware/auth');
const { summarize, summarizeGuest } = require('../services/summarizeService');
const { extractText } = require('../services/documentService');

const router = express.Router();

// Reject oversized uploads before multer buffers them into RAM.
// The plan-specific check (max_file_mb) runs after auth, but this guard
// prevents memory exhaustion from unauthenticated or free-plan requests
// that would otherwise buffer 50 MB before being rejected.
const ABSOLUTE_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB hard ceiling

function rejectOversizedUpload(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > ABSOLUTE_MAX_FILE_BYTES) {
    return res.status(413).json({ error: 'File too large (max 50 MB).' });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ABSOLUTE_MAX_FILE_BYTES },
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

const MAX_CONTENT_CHARS = 60_000; // ~15,000 tokens — prevents Gemini quota abuse

// ─── Guest summarize (no auth — short summaries only, not logged to DB) ────
router.post('/guest', guestRateLimit, async (req, res) => {
  try {
    const { content, sourceUrl, targetLanguage } = req.body;

    if (!content || content.trim().length < 50) {
      return res.status(400).json({ error: 'Content too short to summarize (min 50 characters).' });
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return res.status(400).json({ error: `Content too large (max ${MAX_CONTENT_CHARS.toLocaleString()} characters).` });
    }

    const result = await summarizeGuest({
      content: content.trim(),
      sourceUrl: sourceUrl || null,
      targetLanguage: targetLanguage || 'auto',
    });

    res.json(result);
  } catch (err) {
    console.error('Guest summarize error:', err);
    const msg = err?.message || '';
    res.status(500).json({ error: `Summarization failed: ${msg || 'Unknown error'}` });
  }
});

router.post('/', authenticate, checkSummaryQuota, async (req, res) => {
  try {
    const { content, sourceUrl, size = 'medium', targetLanguage } = req.body;
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
    if (content.length > MAX_CONTENT_CHARS) {
      return res.status(400).json({ error: `Content too large (max ${MAX_CONTENT_CHARS.toLocaleString()} characters).` });
    }

    const result = await summarize({
      userId: req.user.id,
      content: content.trim(),
      size,
      sourceUrl: sourceUrl || null,
      targetLanguage: targetLanguage || 'auto',
    });

    res.json(result);
  } catch (err) {
    console.error('Summarize error:', err);
    const msg = err?.message || '';
    if (msg.includes('API_KEY') || msg.includes('api key') || msg.includes('API key')) {
      return res.status(500).json({ error: 'Gemini API key is missing or invalid. Check GEMINI_API_KEY in Railway.' });
    }
    if (msg.includes('not found') || msg.includes('404') || msg.includes('model')) {
      return res.status(500).json({ error: `Gemini model error: ${msg}` });
    }
    res.status(500).json({ error: `Summarization failed: ${msg || 'Unknown error'}` });
  }
});

// Middleware: reject file upload for free-plan users before multer buffers anything
function requireUploadPlan(req, res, next) {
  if (!req.planLimits?.pdf_upload) {
    return res.status(403).json({
      error: 'File upload requires Basic or Premium plan.',
      current_plan: req.user?.plan,
    });
  }
  next();
}

// ─── File upload endpoint ───────────────────────────────────────────
router.post(
  '/file',
  authenticate,
  checkSummaryQuota,
  requireUploadPlan,         // reject free-plan users before RAM allocation
  rejectOversizedUpload,     // reject by Content-Length header before buffering
  upload.single('file'),
  async (req, res) => {
  try {
    const limits = req.planLimits;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileSizeMb = req.file.size / (1024 * 1024);
    if (fileSizeMb > limits.max_file_mb) {
      return res.status(400).json({
        error: `File exceeds your plan limit of ${limits.max_file_mb}MB.`,
      });
    }

    const { size = 'medium', targetLanguage } = req.body;

    if (!limits.sizes_allowed.includes(size)) {
      return res.status(403).json({
        error: `Summary size "${size}" is not available on your plan.`,
        allowed_sizes: limits.sizes_allowed,
      });
    }

    // Validate MIME type server-side (client can lie about Content-Type)
    const ALLOWED_MIMES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, DOCX, DOC, or TXT.' });
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
      targetLanguage: targetLanguage || 'auto',
    });

    res.json(result);
  } catch (err) {
    console.error('File summarize error:', err);
    res.status(500).json({ error: err.message || 'File summarization failed.' });
  }
});

module.exports = router;
