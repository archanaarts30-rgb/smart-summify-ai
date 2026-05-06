const { getModel } = require('../config/gemini');
const supabase = require('../config/supabase');

// Average reading speed: 238 words per minute
const WORDS_PER_MINUTE = 238;

const SIZE_PROMPTS = {
  small: `Summarize the following content in 3–5 concise sentences. 
Capture only the most essential points. 
Respond in the same language as the input text.`,

  medium: `Summarize the following content in 2–3 short paragraphs. 
Cover the main ideas, key supporting points, and any important conclusions. 
Use clear, simple language. Respond in the same language as the input text.`,

  large: `Provide a comprehensive summary of the following content. 
Include the main thesis, all major points, supporting evidence, and conclusions. 
Structure it with a brief intro, key sections, and a conclusion. 
Respond in the same language as the input text.`,
};

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadSeconds(wordCount) {
  return Math.round((wordCount / WORDS_PER_MINUTE) * 60);
}

async function summarize({ userId, content, size = 'medium', sourceUrl = null, fileName = null }) {
  const model = getModel();
  const prompt = `${SIZE_PROMPTS[size]}\n\n---\n\n${content}`;

  const startMs = Date.now();

  const result = await model.generateContent(prompt);
  const summaryText = result.response.text();

  const durationMs = Date.now() - startMs;

  // ─── Metrics ────────────────────────────────────────────
  const originalWordCount = countWords(content);
  const summaryWordCount = countWords(summaryText);
  const inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;
  const originalReadSec = estimateReadSeconds(originalWordCount);
  const summaryReadSec = estimateReadSeconds(summaryWordCount);
  const timeSavedSec = Math.max(0, originalReadSec - summaryReadSec);

  // ─── Persist to Supabase ────────────────────────────────
  const { data: row, error } = await supabase
    .from('summaries')
    .insert({
      user_id: userId,
      source_url: sourceUrl,
      file_name: fileName,
      summary_text: summaryText,
      size_requested: size,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      original_word_count: originalWordCount,
      summary_word_count: summaryWordCount,
      original_read_sec: originalReadSec,
      summary_read_sec: summaryReadSec,
      time_saved_sec: timeSavedSec,
      duration_ms: durationMs,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to save summary: ' + error.message);

  return {
    summaryId: row.id,
    summary: summaryText,
    metrics: {
      inputTokens,
      outputTokens,
      originalWordCount,
      summaryWordCount,
      compressionRatio: Math.round((1 - summaryWordCount / originalWordCount) * 100),
      originalReadSec,
      summaryReadSec,
      timeSavedSec,
      durationMs,
    },
  };
}

module.exports = { summarize };
