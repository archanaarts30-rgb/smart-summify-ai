/**
 * Lightweight markdown parse for exporting summaries — headings, bullets, ordered
 * lists, paragraphs, bold (**text**). Feeds styled PDF/DOCX/TXT exports so users
 * don't see raw ### or * prefixes in downloads.
 */

/**
 * @typedef {{ bold: boolean, text: string }} InlineSegment
 * @typedef {{ type: 'blank' }} BlankBlock
 * @typedef {{ type: 'heading', level: number, segments: InlineSegment[] }} HeadingBlock
 * @typedef {{ type: 'paragraph', segments: InlineSegment[] }} ParagraphBlock
 * @typedef {{ type: 'list_item', ordered: boolean, orderNum: number, indent: number, segments: InlineSegment[] }} ListBlock
 */

/**
 * Parse **bold** (non-greedy). Does not support nested markers.
 * @param {string} raw
 * @returns {InlineSegment[]}
 */
function parseInline(raw) {
  if (!raw) return [{ bold: false, text: '' }];
  /** @type {InlineSegment[]} */
  const segments = [];
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf('**', i);
    if (start === -1) {
      const rest = raw.slice(i);
      if (rest) {
        const last = segments[segments.length - 1];
        if (last && !last.bold) last.text += rest;
        else segments.push({ bold: false, text: rest });
      }
      break;
    }
    const before = raw.slice(i, start);
    if (before) {
      const last = segments[segments.length - 1];
      if (last && !last.bold) last.text += before;
      else segments.push({ bold: false, text: before });
    }
    const close = raw.indexOf('**', start + 2);
    if (close === -1) {
      const leftover = raw.slice(start);
      const last = segments[segments.length - 1];
      if (last && !last.bold) last.text += leftover;
      else segments.push({ bold: false, text: leftover });
      break;
    }
    const inner = raw.slice(start + 2, close);
    if (inner) segments.push({ bold: true, text: inner });
    i = close + 2;
  }
  const filtered = segments.filter((s) => s.text.length > 0);
  return filtered.length ? filtered : [{ bold: false, text: '' }];
}

/**
 * @param {string} md
 * @returns {(HeadingBlock | ParagraphBlock | ListBlock | BlankBlock)[]}
 */
function markdownToBlocks(md) {
  if (!md || typeof md !== 'string') return [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  /** @type {(HeadingBlock | ParagraphBlock | ListBlock | BlankBlock)[]} */
  const blocks = [];
  /** level -> next index for ordered lists */
  const olCounter = {};

  let lastWasList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push({ type: 'blank' });
      lastWasList = false;
      for (const k of Object.keys(olCounter)) delete olCounter[k];
      continue;
    }

    const leading = line.match(/^(\s*)/)?.[1] || '';
    const indent = Math.min(8, Math.floor(leading.replace(/\t/g, '  ').length / 2));

    const hm = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const level = Math.min(6, hm[1].length);
      blocks.push({ type: 'heading', level, segments: parseInline(hm[2].trimEnd()) });
      lastWasList = false;
      for (const k of Object.keys(olCounter)) delete olCounter[k];
      continue;
    }

    const om = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (om) {
      const n = parseInt(om[1], 10);
      if (!lastWasList) for (const k of Object.keys(olCounter)) delete olCounter[k];
      olCounter[indent] = n + 1;
      blocks.push({
        type: 'list_item',
        ordered: true,
        orderNum: n,
        indent,
        segments: parseInline(om[2].trimEnd()),
      });
      lastWasList = true;
      continue;
    }

    if (/^[-*+]\s/.test(trimmed) || (/^\*\s/.test(trimmed) && !/^\*\*[^*]/.test(trimmed))) {
      const textAfter = trimmed.replace(/^[-*+]\s+|^\*\s+/m, '').trimEnd();
      if (!lastWasList) for (const k of Object.keys(olCounter)) delete olCounter[k];
      blocks.push({
        type: 'list_item',
        ordered: false,
        orderNum: 1,
        indent,
        segments: parseInline(textAfter),
      });
      lastWasList = true;
      continue;
    }

    blocks.push({ type: 'paragraph', segments: parseInline(trimmed) });
    lastWasList = false;
    for (const k of Object.keys(olCounter)) delete olCounter[k];
  }
  return blocks;
}

/** @param {InlineSegment[]} segs */
function flattenSegmentsPlain(segs) {
  return segs.map((s) => s.text).join('');
}

/**
 * Readable plain-text export (no raw markdown punctuation for structure).
 * @param {(HeadingBlock | ParagraphBlock | ListBlock | BlankBlock)[]} blocks
 */
function blocksToPlainText(blocks) {
  const lines = [];
  let lastBlank = false;
  for (const b of blocks) {
    if (b.type === 'blank') {
      if (!lastBlank) lines.push('');
      lastBlank = true;
      continue;
    }
    lastBlank = false;
    const text = flattenSegmentsPlain(b.segments);
    if (b.type === 'heading') {
      lines.push(text);
      lines.push('='.repeat(Math.min(Math.max(text.length, 12), 60)));
      lines.push('');
    } else if (b.type === 'list_item') {
      const dent = '  '.repeat(b.indent);
      const prefix = b.ordered ? `${b.orderNum}. ` : '• ';
      lines.push(`${dent}${prefix}${text}`);
    } else {
      lines.push(text);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n\n\n+/g, '\n\n').trimEnd() + '\n';
}

/**
 * Expand segments into tokens (word + whitespace) preserving bold flags.
 * @param {InlineSegment[]} segments
 */
function segmentsToWords(segments) {
  /** @type {{ bold: boolean, text: string }[]} */
  const words = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const chunks = seg.text.split(/(\s+)/);
    for (const c of chunks) {
      if (!c) continue;
      words.push({ bold: !!seg.bold, text: c });
    }
  }
  return words;
}

module.exports = {
  markdownToBlocks,
  parseInline,
  flattenSegmentsPlain,
  blocksToPlainText,
  segmentsToWords,
};
