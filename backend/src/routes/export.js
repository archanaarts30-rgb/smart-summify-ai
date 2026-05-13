const express  = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const { authenticate, requireFeature } = require('../middleware/auth');
const supabase  = require('../config/supabase');
const {
  markdownToBlocks,
  segmentsToWords,
  blocksToPlainText,
} = require('../utils/summaryMarkdown');

const router = express.Router();

// ─── PDF helpers (markdown-aware, mixed bold) ─────────────────────────

function pdfMeasureToken(tok, fonts, fs) {
  const f = tok.bold ? fonts.bold : fonts.regular;
  return f.widthOfTextAtSize(tok.text, fs);
}

function splitOversizedToken(tok, fonts, fs, maxW) {
  if (pdfMeasureToken(tok, fonts, fs) <= maxW) return [tok];
  const chunks = [];
  const f = tok.bold ? fonts.bold : fonts.regular;
  let acc = '';
  for (let i = 0; i < tok.text.length; i++) {
    const ch = tok.text[i];
    const next = acc + ch;
    if (next && f.widthOfTextAtSize(next, fs) > maxW && acc) {
      chunks.push({ bold: tok.bold, text: acc });
      acc = ch;
    } else {
      acc = next;
    }
  }
  if (acc) chunks.push({ bold: tok.bold, text: acc });
  return chunks;
}

function wrapPdfTokens(rawTokens, maxW, fonts, fs) {
  const normalized = [];
  rawTokens.forEach((t) => normalized.push(...splitOversizedToken(t, fonts, fs, maxW)));

  const lines = [];
  let cur = [];
  let lineW = 0;

  const flush = () => {
    if (cur.length) { lines.push(cur); cur = []; lineW = 0; }
  };

  for (const tok of normalized) {
    const tw = pdfMeasureToken(tok, fonts, fs);
    if (tw > maxW) {
      flush();
      lines.push([tok]);
      continue;
    }
    if (lineW + tw > maxW && cur.length) flush();
    cur.push(tok);
    lineW += tw;
  }
  flush();
  return lines;
}

/** Build a proper PDF buffer using pdf-lib (renders markdown structure). */
async function buildPdf(summary) {
  const pdfDoc  = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  const pageW = 595; const pageH = 842;
  const margin = 56;
  const minBottom = 52;
  const textW = pageW - margin * 2;
  const titleSize = 18;
  const metaSize = 10;
  const bodySize = 12;
  const bodyColor = rgb(0.14, 0.14, 0.14);
  /** Font size by heading depth (# = 1 … ###### = 6) */
  const headingSizes = [17, 15, 14, 13, 12, 12];

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - 56;

  const newPage = () => {
    page = pdfDoc.addPage([pageW, pageH]);
    y = pageH - 56;
  };

  const drawPlain = (text, font, size, color, gapAfter) => {
    if (y < minBottom) newPage();
    page.drawText(text, { x: margin, y, font, size, color, maxWidth: textW });
    y -= size + gapAfter;
  };

  drawPlain('Smart Summify — Summary', fonts.bold, titleSize, rgb(0.1, 0.05, 0.5), 10);

  const source = summary.source_url || summary.file_name;
  if (source) {
    const s = source.length > 90 ? `${source.slice(0, 87)}...` : source;
    drawPlain(s, fonts.regular, metaSize, rgb(0.4, 0.4, 0.8), 6);
  }

  const dateStr = summary.created_at
    ? new Date(summary.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  drawPlain(dateStr, fonts.regular, metaSize, rgb(0.5, 0.5, 0.5), 12);

  if (y > minBottom + 20) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageW - margin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 16;
  }

  const blocks = markdownToBlocks(summary.summary_text || '');

  for (const b of blocks) {
    if (b.type === 'blank') {
      y -= 10;
      continue;
    }

    if (b.type === 'heading') {
      const fs = headingSizes[Math.min(Math.max(b.level, 1), 6) - 1];
      const headingWords = segmentsToWords(b.segments).map((w) => ({ bold: true, text: w.text }));
      const lines = wrapPdfTokens(headingWords, textW, fonts, fs);
      for (const line of lines) {
        if (y < minBottom + fs + 8) newPage();
        let x = margin;
        const fnBold = fonts.bold;
        for (const tok of line) {
          page.drawText(tok.text, { x, y, font: fnBold, size: fs, color: rgb(0.08, 0.08, 0.2), maxWidth: textW });
          x += fnBold.widthOfTextAtSize(tok.text, fs);
        }
        y -= fs + 9;
      }
      y -= 6;
      continue;
    }

    if (b.type === 'list_item') {
      const indentX = 12 + b.indent * 14;
      const prefix = b.ordered ? `${b.orderNum}. ` : '• ';
      const merged = [{ bold: false, text: prefix }, ...segmentsToWords(b.segments)];
      const lines = wrapPdfTokens(merged, textW - indentX, fonts, bodySize);
      for (const line of lines) {
        if (y < minBottom + bodySize + 6) newPage();
        let x = margin + indentX;
        for (const tok of line) {
          const fn = tok.bold ? fonts.bold : fonts.regular;
          page.drawText(tok.text, { x, y, font: fn, size: bodySize, color: bodyColor, maxWidth: textW - indentX });
          x += fn.widthOfTextAtSize(tok.text, bodySize);
        }
        y -= bodySize + 8;
      }
      continue;
    }

    /* paragraph */
    const lines = wrapPdfTokens(segmentsToWords(b.segments), textW, fonts, bodySize);
    for (const line of lines) {
      if (y < minBottom + bodySize + 6) newPage();
      let x = margin;
      for (const tok of line) {
        const fn = tok.bold ? fonts.bold : fonts.regular;
        page.drawText(tok.text, { x, y, font: fn, size: bodySize, color: bodyColor, maxWidth: textW });
        x += fn.widthOfTextAtSize(tok.text, bodySize);
      }
      y -= bodySize + 8;
    }
    y -= 4;
  }

  return Buffer.from(await pdfDoc.save());
}

// ─── DOCX helpers ────────────────────────────────────────────────────

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function docxRunsFromSegments(segments, halfPt = 24) {
  return segments.map(
    (s) => new TextRun({ text: s.text, bold: !!s.bold, size: halfPt }),
  );
}

/** Build a proper DOCX buffer (markdown headings, bullets, bold). */
async function buildDocx(summary) {
  const source  = summary.source_url || summary.file_name;
  const dateStr = summary.created_at
    ? new Date(summary.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'Smart Summify — Summary', bold: true, size: 36, color: '1A0D80' })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
    }),
  ];

  if (source) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Source: ${source}`, size: 18, color: '4040CC', italics: true })],
      spacing: { after: 60 },
    }));
  }

  children.push(new Paragraph({
    children: [new TextRun({ text: dateStr, size: 18, color: '888888' })],
    spacing: { after: 200 },
  }));

  const blocks = markdownToBlocks(summary.summary_text || '');

  for (const b of blocks) {
    if (b.type === 'blank') {
      children.push(new Paragraph({
        children: [new TextRun({ text: '', size: 2 })],
        spacing: { after: 100 },
      }));
      continue;
    }

    if (b.type === 'heading') {
      const lvl = HEADING_LEVELS[Math.min(Math.max(b.level, 1), 6) - 1];
      const sizeMap = [40, 36, 32, 28, 26, 24];
      const sz = sizeMap[Math.min(Math.max(b.level, 1), 6) - 1];
      children.push(new Paragraph({
        children: b.segments.map((s) => new TextRun({ text: s.text, bold: true, size: sz })),
        heading: lvl,
        spacing: { before: 120, after: 80 },
      }));
      continue;
    }

    if (b.type === 'list_item') {
      const leftTwip = 360 + Math.min(b.indent, 8) * 280;
      const prefix = b.ordered ? `${b.orderNum}. ` : '• ';
      children.push(new Paragraph({
        children: [
          new TextRun({ text: prefix, size: 24 }),
          ...docxRunsFromSegments(b.segments, 24),
        ],
        indent: { left: leftTwip },
        spacing: { after: 80 },
      }));
      continue;
    }

    children.push(new Paragraph({
      children: docxRunsFromSegments(b.segments, 24),
      spacing: { after: 140 },
      alignment: AlignmentType.LEFT,
    }));
  }

  const doc = new Document({
    creator: 'Smart Summify AI',
    description: 'AI-generated summary',
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

// ─── Route ──────────────────────────────────────────────────────────

router.post('/', authenticate, requireFeature('export'), async (req, res) => {
  try {
    const { summaryId, format = 'txt' } = req.body;

    if (!['txt', 'pdf', 'docx'].includes(format)) {
      return res.status(400).json({ error: 'Format must be txt, pdf, or docx.' });
    }

    const { data: summary, error } = await supabase
      .from('summaries')
      .select('summary_text, source_url, file_name, created_at')
      .eq('id', summaryId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !summary) {
      return res.status(404).json({ error: 'Summary not found.' });
    }

    let fileBuffer;
    let mimeType;
    const fileName = `exports/${req.user.id}/${summaryId}.${format}`;

    if (format === 'txt') {
      const source  = summary.source_url || summary.file_name || '';
      const dateStr = summary.created_at ? new Date(summary.created_at).toLocaleString() : '';
      const header  = [
        '=== Smart Summify AI — Summary ===',
        source  ? `Source:  ${source}`  : '',
        dateStr ? `Created: ${dateStr}` : '',
        '='.repeat(36),
        '',
      ].join('\n');
      const body = blocksToPlainText(markdownToBlocks(summary.summary_text || ''));
      fileBuffer = Buffer.from(`${header}${body}`, 'utf-8');
      mimeType   = 'text/plain; charset=utf-8';
    } else if (format === 'pdf') {
      fileBuffer = await buildPdf(summary);
      mimeType   = 'application/pdf';
    } else if (format === 'docx') {
      fileBuffer = await buildDocx(summary);
      mimeType   = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    const expiresIn = req.user.plan === 'premium' ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
    const { data: urlData, error: urlError } = await supabase.storage
      .from('exports')
      .createSignedUrl(fileName, expiresIn, { download: true });

    if (urlError || !urlData?.signedUrl) throw urlError || new Error('Could not generate download URL');

    res.json({ downloadUrl: urlData.signedUrl, format, expiresIn });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: `Export failed: ${err.message || 'Unknown error'}` });
  }
});

module.exports = router;
