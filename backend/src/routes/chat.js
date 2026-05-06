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

    // ─── Check per-summary chat limit for Basic plan ────────
    if (limits.chat_messages_per_summary !== Infinity) {
      if (history.length >= limits.chat_messages_per_summary) {
        return res.status(403).json({
          error: `Chat limit of ${limits.chat_messages_per_summary} messages per summary reached. Upgrade to Premium for unlimited chat.`,
        });
      }
    }

    const model = getModel();

    // ─── Build context-aware prompt ─────────────────────────
    const systemContext = `You are a helpful assistant answering questions about the following content.
Only answer based on this content. If the answer isn't in the content, say so clearly.

CONTENT:
${summary.summary_text}

SOURCE: ${summary.source_url || summary.file_name || 'Uploaded document'}`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        { role: 'model', parts: [{ text: 'Understood. I will answer questions based only on this content.' }] },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    // ─── Persist thread to Supabase ─────────────────────────
    await supabase.from('chat_messages').insert([
      { summary_id: summaryId, user_id: req.user.id, role: 'user', content: message },
      { summary_id: summaryId, user_id: req.user.id, role: 'assistant', content: reply },
    ]);

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat failed. Please try again.' });
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
