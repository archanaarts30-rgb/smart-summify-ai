const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getModel } = require('../config/gemini');
const supabase = require('../config/supabase');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  try {
    const limits = req.planLimits;

    if (limits.social_images === 0) {
      return res.status(403).json({
        error: 'Social image generation requires Basic or Premium plan.',
        current_plan: req.user.plan,
      });
    }

    const { summaryId, count = 3 } = req.body;

    const clampedCount = Math.min(
      Math.max(2, parseInt(count) || 3),
      limits.social_images
    );

    const { data: summary, error } = await supabase
      .from('summaries')
      .select('summary_text')
      .eq('id', summaryId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !summary) {
      return res.status(404).json({ error: 'Summary not found.' });
    }

    const model = getModel();

    const prompt = `You are a social media content designer.
Given the summary below, create exactly ${clampedCount} social media post cards.
Each card should highlight a different key point.

Return ONLY valid JSON (no markdown, no backticks) in this exact format:
{
  "cards": [
    {
      "headline": "Short punchy headline (max 8 words)",
      "body": "1-2 sentence insight from the content (max 40 words)",
      "cta": "Short call-to-action phrase (max 6 words)",
      "theme": "one of: blue|purple|teal|coral|amber"
    }
  ]
}

SUMMARY:
${summary.summary_text}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON robustly — Gemini may wrap response in markdown fences
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Social: no JSON in Gemini response:', responseText.slice(0, 300));
      return res.status(500).json({ error: 'AI did not return valid card data. Please try again.' });
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('Social: JSON parse failed:', jsonMatch[0].slice(0, 300));
      return res.status(500).json({ error: 'Failed to parse card structure from AI. Please try again.' });
    }
    if (!parsed.cards || !Array.isArray(parsed.cards)) {
      return res.status(500).json({ error: 'AI returned unexpected card format. Please try again.' });
    }

    res.json({ cards: parsed.cards.slice(0, clampedCount) });
  } catch (err) {
    console.error('Social images error:', err);
    const msg = err?.message || 'Social image generation failed.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
