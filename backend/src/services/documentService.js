const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text.trim();
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8').trim();
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

module.exports = { extractText };
