const express = require('express');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

const router = express.Router();

const CATEGORIES = new Set(['bug', 'feature', 'billing', 'general']);
const MAX_MESSAGE = 4000;

router.post('/', authenticate, async (req, res) => {
  let { category = 'general', message, extensionVersion } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  message = message.trim().replace(/\r\n/g, '\n');
  if (message.length < 3) {
    return res.status(400).json({ error: 'Please enter at least a few characters.' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });
  }

  if (typeof category !== 'string' || !CATEGORIES.has(category)) {
    category = 'general';
  }

  let extension_version = null;
  if (extensionVersion != null && typeof extensionVersion === 'string') {
    extension_version = extensionVersion.trim().slice(0, 64);
    if (extension_version === '') extension_version = null;
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: req.user.id,
    category,
    message,
    extension_version,
  });

  if (error) {
    console.error('[feedback] insert failed:', error);
    return res.status(500).json({ error: 'Could not save feedback. Please try again.' });
  }

  res.json({ success: true });
});

module.exports = router;
