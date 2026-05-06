const express = require('express');
const PptxGenJS = require('pptxgenjs');
const { authenticate, requireFeature } = require('../middleware/auth');
const { getModel } = require('../config/gemini');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.post('/', authenticate, requireFeature('slides'), async (req, res) => {
  try {
    const { summaryId, slideCount = 8 } = req.body;
    const clampedSlides = Math.min(Math.max(5, parseInt(slideCount) || 8), 15);

    const { data: summary, error } = await supabase
      .from('summaries')
      .select('summary_text, source_url, file_name')
      .eq('id', summaryId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !summary) {
      return res.status(404).json({ error: 'Summary not found.' });
    }

    // ─── Ask Gemini to structure into slides ─────────────────
    const model = getModel();
    const prompt = `You are a presentation designer. Convert the summary below into exactly ${clampedSlides} presentation slides.
Return ONLY valid JSON (no markdown, no backticks):
{
  "title": "Presentation title",
  "slides": [
    {
      "title": "Slide title (max 8 words)",
      "bullets": ["Point 1 (max 15 words)", "Point 2", "Point 3"],
      "note": "Speaker note (optional, 1 sentence)"
    }
  ]
}

SUMMARY:
${summary.summary_text}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().replace(/```json|```/g, '').trim();
    const deck = JSON.parse(raw);

    // ─── Build PPTX ───────────────────────────────────────────
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = deck.title;

    const THEME = {
      bg: '1E1E2E',
      accent: '7C6AF7',
      text: 'FFFFFF',
      subtext: 'A0A0C0',
    };

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: THEME.bg };
    titleSlide.addText(deck.title, {
      x: 0.5, y: 2.5, w: '90%', h: 1.5,
      fontSize: 36, bold: true, color: THEME.text,
      align: 'center',
    });
    const src = summary.source_url || summary.file_name || 'Smart Summify AI';
    titleSlide.addText(src, {
      x: 0.5, y: 4.2, w: '90%', h: 0.5,
      fontSize: 14, color: THEME.subtext, align: 'center',
    });

    // Content slides
    for (const slide of deck.slides.slice(0, clampedSlides - 1)) {
      const s = pptx.addSlide();
      s.background = { color: THEME.bg };

      // Accent bar
      s.addShape(pptx.ShapeType.rect, {
        x: 0.4, y: 0.4, w: 0.08, h: 0.9,
        fill: { color: THEME.accent },
        line: { color: THEME.accent },
      });

      s.addText(slide.title, {
        x: 0.65, y: 0.35, w: '85%', h: 0.9,
        fontSize: 24, bold: true, color: THEME.text,
      });

      const bulletText = (slide.bullets || []).map(b => ({ text: b, options: { bullet: true } }));
      s.addText(bulletText, {
        x: 0.65, y: 1.5, w: '85%', h: 4.5,
        fontSize: 16, color: THEME.subtext,
        lineSpacingMultiple: 1.4,
      });

      if (slide.note) {
        s.addNotes(slide.note);
      }
    }

    // ─── Export to buffer and upload to Supabase Storage ─────
    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
    const filePath = `slides/${req.user.id}/${uuidv4()}.pptx`;

    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(filePath, pptxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = await supabase.storage
      .from('exports')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7-day link

    res.json({ downloadUrl: urlData.signedUrl, slideCount: deck.slides.length + 1 });
  } catch (err) {
    console.error('Slides error:', err);
    res.status(500).json({ error: 'Slide generation failed.' });
  }
});

module.exports = router;
