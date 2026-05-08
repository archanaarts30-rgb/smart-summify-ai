const express  = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const { authenticate, requireFeature } = require('../middleware/auth');
const supabase  = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────

/** Wrap plain text into lines no wider than maxChars. */
function wrapText(text, maxChars = 90) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + (line ? ' ' : '') + word).length > maxChars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Build a proper PDF buffer using pdf-lib. */
async function buildPdf(summary) {
  const pdfDoc  = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595, pageH = 842; // A4 points
  const margin = 56, lineH = 18, titleSize = 18, bodySize = 12, metaSize = 10;
  const textW = pageW - margin * 2;

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - 60;

  const newPage = () => {
    page = pdfDoc.addPage([pageW, pageH]);
    y = pageH - 60;
  };

  const drawLine = (text, font, size, color = rgb(0.1, 0.1, 0.1), extraGap = 0) => {
    if (y < 60) newPage();
    page.drawText(text, { x: margin, y, font, size, color, maxWidth: textW });
    y -= (size + extraGap + 4);
  };

  // Title
  drawLine('Smart Summify — Summary', bold, titleSize, rgb(0.1, 0.05, 0.5), 8);

  // Source / file
  const source = summary.source_url || summary.file_name;
  if (source) {
    drawLine(source.length > 90 ? source.slice(0, 87) + '...' : source, regular, metaSize, rgb(0.4, 0.4, 0.8), 4);
  }

  // Date
  const dateStr = summary.created_at
    ? new Date(summary.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  drawLine(dateStr, regular, metaSize, rgb(0.5, 0.5, 0.5), 10);

  // Divider line
  if (y > 60) {
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 16;
  }

  // Body text — wrap and flow across pages
  const lines = wrapText(summary.summary_text, 85);
  for (const line of lines) {
    if (!line) { y -= lineH * 0.5; continue; }
    if (y < 60) newPage();
    page.drawText(line, { x: margin, y, font: regular, size: bodySize, color: rgb(0.15, 0.15, 0.15), maxWidth: textW });
    y -= lineH;
  }

  return Buffer.from(await pdfDoc.save());
}

/** Build a proper DOCX buffer using the docx library. */
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

  // Body — one paragraph per line (preserving blank-line spacing)
  const paragraphs = summary.summary_text.split('\n');
  for (const p of paragraphs) {
    children.push(new Paragraph({
      children: [new TextRun({ text: p || '', size: 24 })],
      spacing: { after: p.trim() ? 120 : 60 },
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
    const fileName = `exports/${req.user.id}/${summaryId}-${uuidv4()}.${format}`;

    if (format === 'txt') {
      // Include source + date as a header in the text file
      const source  = summary.source_url || summary.file_name || '';
      const dateStr = summary.created_at ? new Date(summary.created_at).toLocaleString() : '';
      const header  = [
        '=== Smart Summify AI — Summary ===',
        source  ? `Source:  ${source}`  : '',
        dateStr ? `Created: ${dateStr}` : '',
        '='.repeat(36),
        '',
      ].filter(l => l !== null).join('\n');
      fileBuffer = Buffer.from(header + summary.summary_text, 'utf-8');
      mimeType   = 'text/plain; charset=utf-8';
    } else if (format === 'pdf') {
      fileBuffer = await buildPdf(summary);
      mimeType   = 'application/pdf';
    } else if (format === 'docx') {
      fileBuffer = await buildDocx(summary);
      mimeType   = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // ─── Upload to Supabase Storage ──────────────────────────
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    // ─── Signed URL — force download in browser ──────────────
    // download:true adds Content-Disposition: attachment so the browser
    // downloads the file rather than displaying it inline (critical for TXT).
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
