const express = require('express');
const { authenticate, requireFeature } = require('../middleware/auth');
const { getModel } = require('../config/gemini');
const supabase = require('../config/supabase');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  try {
    const limits = req.planLimits;

    if (limits.chat_messages_per_summary === 0) {
      return res.status(403).json({
        error: 'Chat requires Basic or Premium plan.',
        current_plan: req.user.plan,
      });
    }

    const { summaryId, message, history = [] } = req.body;

    if (!summaryId || !message) {
      return res.status(400).json({ error: 'summaryId and message are required.' });
    }
    if (message.length > 2_000) {
      return res.status(400).json({ error: 'Message too long (max 2,000 characters).' });
    }
    if (!Array.isArray(history) || history.length > 100) {
      return res.status(400).json({ error: 'Invalid history.' });
    }

    // ─── Load the summary for context ──────────────────────
    const { data: summary, error } = await supabase
      .from('summaries')
      .select('summary_text, source_url, file_name')
      .eq('id', summaryId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !summary) {
      return res.status(404).json({ error: 'Summary not found.' });
    }

    // ─── Check per-summary chat limit using DB count (not client history) ──
    // Counting from the DB prevents users from bypassing the limit by sending
    // an empty history[] in every request.
    if (limits.chat_messages_per_summary !== Infinity) {
      const { count: dbMsgCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('summary_id', summaryId)
        .eq('user_id', req.user.id)
        .eq('role', 'user'); // count only user turns

      if ((dbMsgCount || 0) >= limits.chat_messages_per_summary) {
        return res.status(403).json({
          error: `Chat limit of ${limits.chat_messages_per_summary} messages per summary reached. Upgrade to Premium for unlimited chat.`,
        });
      }
    }

    const model = getModel();

    // ─── Build full conversation as a single prompt ──────────
    // Using generateContent (not startChat) for compatibility with all Gemini 2.x models.
    const source = summary.source_url || summary.file_name || 'Uploaded document';

    let prompt = `You are a helpful assistant answering questions about the following content.
Only answer based on this content. If the answer is not in the content, say so clearly.

SOURCE: ${source}

CONTENT:
${summary.summary_text}

---
CONVERSATION SO FAR:
`;

    for (const msg of history) {
      const speaker = msg.role === 'user' ? 'User' : 'Assistant';
      prompt += `${speaker}: ${msg.content}\n`;
    }

    prompt += `User: ${message}\nAssistant:`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    // ─── Persist thread to Supabase ─────────────────────────
    const { error: insertError } = await supabase.from('chat_messages').insert([
      { summary_id: summaryId, user_id: req.user.id, role: 'user',      content: message },
      { summary_id: summaryId, user_id: req.user.id, role: 'assistant', content: reply  },
    ]);

    if (insertError) {
      // Non-fatal — still return the reply, just log the DB failure
      console.error('[chat] Failed to persist messages:', insertError.message);
    }

    res.json({ reply });
  } catch (err) {
    const msg = err?.message || 'Unknown error';
    console.error('[chat] Error:', msg, err);
    res.status(500).json({ error: `Chat failed: ${msg}` });
  }
});

// ─── Get chat history for a summary ─────────────────────────────────
router.get('/:summaryId', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('summary_id', req.params.summaryId)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Could not load chat history.' });
  res.json({ messages: data });
});

module.exports = router;
