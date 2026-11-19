/**
 * Spec 025 T019-T021 / FR-014 — server-side document parsers for import.
 *
 * Converts uploaded files to plain text / markdown for the AI section-mapper:
 *   - .md / .txt  → raw UTF-8 text
 *   - .html       → tag-stripped text (script/style/event-handlers removed at
 *                   parse time as defense-in-depth, not just at render)
 *   - .pdf        → pdf-parse extracted text
 *   - .docx       → mammoth markdown conversion
 *
 * Parsers that cannot extract usable content throw UnsupportedFormatError so the
 * caller can route to the C15 bug-report fallback. All parsers cap output at the
 * 500k-char import ceiling (C18 parser-DoS defense).
 */
import mammoth from 'mammoth';
import { IMPORT_MAX_CHARS } from '~/shared/url-allowlist.js';

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

export type SupportedImportExt = 'md' | 'txt' | 'html' | 'pdf' | 'docx';

const EXT_BY_MIME: Record<string, SupportedImportExt> = {
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** Resolve the parser kind from a filename + mimetype, or null if unsupported. */
export function resolveImportExt(filename: string, mimetype?: string): SupportedImportExt | null {
  const byExt = filename.toLowerCase().match(/\.(md|markdown|txt|html?|pdf|docx)$/);
  if (byExt) {
    const e = byExt[1];
    if (e === 'markdown') return 'md';
    if (e === 'htm' || e === 'html') return 'html';
    return e as SupportedImportExt;
  }
  if (mimetype && EXT_BY_MIME[mimetype]) return EXT_BY_MIME[mimetype];
  return null;
}

function capContent(text: string): string {
  if (text.length > IMPORT_MAX_CHARS) {
    throw new UnsupportedFormatError(
      `Content exceeds the ${IMPORT_MAX_CHARS.toLocaleString()}-character ceiling — an overview isn't the right container for that volume.`,
    );
  }
  return text;
}

/** Strip an HTML string to readable text (shared by parseHtml + parseDocx). */
function stripHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip HTML to readable text. Removes scripts/styles/iframes + inline handlers. */
export function parseHtml(buffer: Buffer): string {
  const text = stripHtml(buffer.toString('utf-8'));
  if (!text) throw new UnsupportedFormatError('No readable text found in the HTML.');
  return capContent(text);
}

export async function parsePdf(buffer: Buffer): Promise<string> {
  // pdf-parse is CommonJS (`export =`); dynamic import keeps types and avoids
  // its debug harness running at module top-level.
  const pdfParse = (await import('pdf-parse')).default;
  let result: { text: string };
  try {
    result = await pdfParse(buffer);
  } catch (err) {
    throw new UnsupportedFormatError(
      `Could not read this PDF (it may be encrypted or corrupt): ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
  const text = (result.text || '').trim();
  // Scanned/image-only PDFs extract little-to-no text — route to C15 fallback.
  if (text.length < 20) {
    throw new UnsupportedFormatError('This PDF has no extractable text (it may be scanned images).');
  }
  return capContent(text);
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  let text: string;
  try {
    // Convert to HTML (typed mammoth API), then strip to text — preserves
    // heading/list/paragraph structure better than raw text extraction.
    const result = await mammoth.convertToHtml({ buffer });
    text = stripHtml(result.value || '');
  } catch (err) {
    throw new UnsupportedFormatError(
      `Could not read this .docx file: ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
  // Image-only docx: tiny text from a large file means the content was images.
  if (text.length < 100 && buffer.length > 100_000) {
    throw new UnsupportedFormatError('This document appears to contain only images — no extractable text.');
  }
  if (!text) throw new UnsupportedFormatError('No readable text found in the document.');
  return capContent(text);
}

/**
 * Parse an uploaded file buffer to text/markdown, dispatching by extension.
 * Throws UnsupportedFormatError for unreadable content (caller → C15 fallback)
 * or a plain Error for an unsupported file type.
 */
export async function parseImportFile(
  filename: string,
  mimetype: string | undefined,
  buffer: Buffer,
): Promise<{ ext: SupportedImportExt; text: string }> {
  const ext = resolveImportExt(filename, mimetype);
  if (!ext) {
    throw new Error('Unsupported file type. Accepted: .md, .txt, .html, .pdf, .docx');
  }
  switch (ext) {
    case 'md':
    case 'txt':
      return { ext, text: capContent(buffer.toString('utf-8').trim()) };
    case 'html':
      return { ext, text: parseHtml(buffer) };
    case 'pdf':
      return { ext, text: await parsePdf(buffer) };
    case 'docx':
      return { ext, text: await parseDocx(buffer) };
  }
}
