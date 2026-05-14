const express = require('express');
const PptxGenJS = require('pptxgenjs');
const { authenticate, requireFeature } = require('../middleware/auth');
const { getModel } = require('../config/gemini');
const supabase = require('../config/supabase');
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
    const prompt = `You are an expert presentation strategist and executive communication specialist.

Your task is to convert the provided content into a highly professional, informative, visually presentable PowerPoint presentation.

Requirements:

1. Create a logical narrative flow across slides.
2. Avoid walls of text.
3. Every slide must have:
   - a concise, professional title
   - key bullet points
   - presenter notes (optional)
4. Use short, presentation-friendly wording.
5. Include only high-value information.
6. Avoid repeating the same information.
7. Structure content so the audience can understand the topic quickly.
8. Prioritize clarity, readability, and storytelling.

Slide Guidelines:
- Title slide
- Overview/Agenda slide (if suitable)
- Concept or section slides
- Key insights
- Important statistics or findings
- Challenges/Problems
- Solutions/Recommendations
- Conclusion/Takeaways

Rules:
- Max 5 bullet points per slide.
- Max 12 words per bullet point.
- Avoid paragraphs.
- Use action-oriented and informative headings.
- Merge duplicate ideas.
- If content is limited, create fewer slides.
- If content is detailed, create up to ${clampedSlides} slides.

Return ONLY valid JSON (no markdown, no code fences) in the following format:

{
  "presentation_title": "",
  "slides": [
    {
      "slide_number": 1,
      "title": "",
      "subtitle": "",
      "bullets": [],
      "visual_suggestion": "",
      "speaker_notes": ""
    }
  ]
}

SUMMARY TO CONVERT:
${summary.summary_text}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON robustly — Gemini may wrap it in markdown fences
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Slides: no JSON in Gemini response:', responseText.slice(0, 300));
      return res.status(500).json({ error: 'AI did not return valid slide data. Please try again.' });
    }
    let deck;
    try {
      deck = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('Slides: JSON parse failed:', jsonMatch[0].slice(0, 300));
      return res.status(500).json({ error: 'Failed to parse slide structure from AI. Please try again.' });
    }
    if (!deck.slides || !Array.isArray(deck.slides)) {
      return res.status(500).json({ error: 'AI returned unexpected slide format. Please try again.' });
    }

    const presentationTitle = deck.presentation_title || deck.title || 'Presentation';
    const sortedSlides = [...deck.slides].sort(
      (a, b) => (Number(a.slide_number) || 0) - (Number(b.slide_number) || 0),
    );
    const slidesToUse = sortedSlides.slice(0, clampedSlides);
    if (slidesToUse.length === 0) {
      return res.status(500).json({ error: 'AI returned no slides. Please try again.' });
    }

    const src = summary.source_url || summary.file_name || 'Smart Summify AI';

    // ─── Build PPTX ───────────────────────────────────────────
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = presentationTitle;

    const THEME = {
      bg: '1E1E2E',
      accent: '7C6AF7',
      text: 'FFFFFF',
      subtext: 'A0A0C0',
    };

    slidesToUse.forEach((slide, i) => {
      const s = pptx.addSlide();
      s.background = { color: THEME.bg };

      const title = (slide.title || '').trim() || presentationTitle;
      const subtitle = (slide.subtitle || '').trim();
      const bullets = Array.isArray(slide.bullets) ? slide.bullets.filter(Boolean) : [];
      const notesParts = [
        slide.speaker_notes,
        slide.note,
        slide.visual_suggestion && `Visual suggestion: ${slide.visual_suggestion}`,
      ].filter(Boolean);
      const notesText = notesParts.join('\n\n').trim();

      const isHeroTitle = i === 0 && bullets.length === 0;
      if (isHeroTitle) {
        const head = presentationTitle || title;
        s.addText(head, {
          x: 0.5, y: 2.5, w: '90%', h: 1.5,
          fontSize: 36, bold: true, color: THEME.text,
          align: 'center',
        });
        const subline = subtitle || (title !== head ? title : '');
        if (subline) {
          s.addText(subline, {
            x: 0.5, y: 3.9, w: '90%', h: 0.5,
            fontSize: 16, color: THEME.subtext, align: 'center',
          });
        }
        s.addText(src, {
          x: 0.5, y: 4.35, w: '90%', h: 0.5,
          fontSize: 14, color: THEME.subtext, align: 'center',
        });
      } else {
        s.addShape(pptx.ShapeType.rect, {
          x: 0.4, y: 0.4, w: 0.08, h: 0.9,
          fill: { color: THEME.accent },
          line: { color: THEME.accent },
        });

        s.addText(title, {
          x: 0.65, y: 0.35, w: '85%', h: subtitle ? 0.55 : 0.9,
          fontSize: 24, bold: true, color: THEME.text,
        });

        if (subtitle) {
          s.addText(subtitle, {
            x: 0.65, y: 0.92, w: '85%', h: 0.45,
            fontSize: 14, color: THEME.subtext,
          });
        }

        const bulletY = subtitle ? 1.55 : 1.4;
        const bulletText = bullets.map((b) => ({ text: String(b), options: { bullet: true } }));
        if (bulletText.length > 0) {
          s.addText(bulletText, {
            x: 0.65, y: bulletY, w: '85%', h: 4.6,
            fontSize: 16, color: THEME.subtext,
            lineSpacingMultiple: 1.4,
          });
        }
      }

      if (notesText) {
        s.addNotes(notesText);
      }
    });

    // ─── Export to buffer and upload to Supabase Storage ─────
    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
    // Deterministic path: re-generating slides for the same summary replaces the file
    const filePath = `slides/${req.user.id}/${summaryId}.pptx`;

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

    res.json({ downloadUrl: urlData.signedUrl, slideCount: slidesToUse.length });
  } catch (err) {
    console.error('Slides error:', err);
    const msg = err?.message || 'Slide generation failed. Please try again.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
