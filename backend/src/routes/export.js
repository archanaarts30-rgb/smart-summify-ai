const express = require('express');
const { authenticate, requireFeature } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

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
      fileBuffer = Buffer.from(summary.summary_text, 'utf-8');
      mimeType = 'text/plain';
    } else if (format === 'pdf') {
      // Simple PDF generation using raw PDF syntax (no heavy library needed for plain text)
      const escaped = summary.summary_text.replace(/[()\\]/g, '\\$&');
      const lines = summary.summary_text.match(/.{1,80}/g) || [];
      let yPos = 750;
      let streamContent = '';
      for (const line of lines) {
        const safeL = line.replace(/[()\\]/g, '\\$&');
        streamContent += `BT /F1 12 Tf 50 ${yPos} Td (${safeL}) Tj ET\n`;
        yPos -= 16;
        if (yPos < 50) break;
      }
      const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${streamContent.length}>>
stream
${streamContent}
endstream
endobj
xref
0 6
trailer<</Size 6/Root 1 0 R>>
%%EOF`;
      fileBuffer = Buffer.from(pdfContent, 'utf-8');
      mimeType = 'application/pdf';
    } else if (format === 'docx') {
      // Minimal OOXML docx (no library dependency)
      const docxText = summary.summary_text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const paragraphs = docxText.split('\n').filter(Boolean)
        .map(p => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
        .join('');
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}</w:body></w:document>`;
      fileBuffer = Buffer.from(docXml, 'utf-8');
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // ─── Upload to Supabase Storage ──────────────────────────
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    // ─── Generate signed URL (24h expiry) ───────────────────
    const expiresIn = req.user.plan === 'premium' ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
    const { data: urlData } = await supabase.storage
      .from('exports')
      .createSignedUrl(fileName, expiresIn);

    res.json({ downloadUrl: urlData.signedUrl, format, expiresIn });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

module.exports = router;
