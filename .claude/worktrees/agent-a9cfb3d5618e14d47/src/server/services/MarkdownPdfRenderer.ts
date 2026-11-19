import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import type { Browser } from 'puppeteer';
import chromiumPkg from '@sparticuz/chromium';
// @sparticuz/chromium is ESM (type:module) with the chromium object as its default export.
// In the esbuild-bundled CJS server the default interop can leave the real object one level
// deeper (.default), so unwrap by probing for the executablePath function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chromium: any =
  typeof (chromiumPkg as any)?.executablePath === 'function'
    ? chromiumPkg
    : ((chromiumPkg as any)?.default ?? chromiumPkg);
import { marked } from 'marked';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '~/server/lib/logger.js';
import { WATERMARK_HOST } from '@wxkanban/watermark';

const logger = createLogger('markdown-pdf-renderer');

// Mermaid v10 ESM build served via jsDelivr. Pinned to match package.json.
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.5/dist/mermaid.esm.min.mjs';

// [SCOPE 082 / T007] BEGIN — visible per-page wxKanban attribution footer
const PDF_FOOTER_TEMPLATE =
  '<div style="width:100%;font-size:8px;color:#9ca3af;text-align:center;font-family:sans-serif;padding:0 24px;">' +
  `Generated with wxKanban — ${WATERMARK_HOST} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;
// [SCOPE 082 / T007] END

export class MarkdownPdfRenderer {
  /**
   * Render markdown (with ```mermaid``` fences) to a PDF Buffer.
   * Launches headless Chromium, runs marked + mermaid in-page, then page.pdf().
   */
  static async renderToPdf(markdown: string, title = 'Project Lifecycle'): Promise<Buffer> {
    const bodyHtml = await markedWithMermaidFences(markdown);
    const html = wrapHtml(bodyHtml, title);

    const browser = await launchBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Let mermaid finish rendering all diagrams.
      await page.evaluate(async () => {
        const w = window as unknown as { mermaidReady?: Promise<void> };
        if (w.mermaidReady) await w.mermaidReady;
      });

      // [SCOPE 082 / T007] visible per-page wxKanban footer (displayHeaderFooter
      // + larger bottom margin so the footer never overlaps body content).
      const pdfUint8 = await page.pdf({
        format: 'Letter',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: PDF_FOOTER_TEMPLATE,
        margin: { top: '0.5in', bottom: '0.7in', left: '0.5in', right: '0.5in' },
      });

      // [SCOPE 082 / T007] wxKanban document metadata (Author/Producer/...). Fail-open.
      const stamped = await applyPdfMetadata(Buffer.from(pdfUint8), title);
      logger.info({ bytes: stamped.length, title }, 'Markdown rendered to PDF');
      return stamped;
    } finally {
      await browser.close();
    }
  }
}

// [SCOPE 082 / T007] BEGIN — applyPdfMetadata (wxKanban PDF document metadata)
// Post-processes the rendered PDF to set Author/Producer/Subject/Keywords so the
// document's properties identify wxKanban. Puppeteer's page.pdf() cannot set
// these, so pdf-lib re-saves with them. Fail-open: on any error the original
// PDF bytes are returned unchanged (FR-009).
async function applyPdfMetadata(pdf: Buffer, title: string): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(pdf);
    doc.setAuthor('wxKanban');
    doc.setProducer(`wxKanban — ${WATERMARK_HOST}`);
    doc.setCreator(`wxKanban — ${WATERMARK_HOST}`);
    doc.setSubject(`Generated with wxKanban — ${WATERMARK_HOST}`);
    doc.setKeywords(['wxKanban', WATERMARK_HOST]);
    if (title) doc.setTitle(title);
    return Buffer.from(await doc.save());
  } catch (err) {
    logger.warn({ err }, 'PDF metadata stamping failed; returning unstamped PDF');
    return pdf;
  }
}
// [SCOPE 082 / T007] END

// App Runner's managed Node runtime has no usable system Chromium, so full `puppeteer`
// fails to launch there (instant 500). In production launch the serverless build
// (@sparticuz/chromium via puppeteer-core); locally use full puppeteer + its bundled Chromium.
async function launchBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === 'production') {
    return (await puppeteerCore.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser;
  }
  return puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
}

// Serverless Chromium ships no system fonts (blank glyphs), so embed the brand font the
// same way BannerRenderService does — read the shipped TTFs and inline them as @font-face.
// Cached; fail-open to system fonts (local dev has them).
let cachedFontCss: string | null | undefined;
function interFontFaceCss(): string {
  if (cachedFontCss !== undefined) return cachedFontCss ?? '';
  try {
    const dir = join(process.cwd(), 'src', 'server', 'assets', 'fonts');
    const reg = readFileSync(join(dir, 'Inter-Regular.ttf')).toString('base64');
    const bold = readFileSync(join(dir, 'Inter-ExtraBold.ttf')).toString('base64');
    cachedFontCss =
      `@font-face{font-family:'Inter';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${reg}) format('truetype');}` +
      `@font-face{font-family:'Inter';font-style:normal;font-weight:800;src:url(data:font/ttf;base64,${bold}) format('truetype');}`;
  } catch {
    cachedFontCss = null;
  }
  return cachedFontCss ?? '';
}

/**
 * Convert markdown to HTML, replacing ```mermaid``` fenced blocks with
 * <div class="mermaid">...</div> so mermaid can render them client-side.
 */
async function markedWithMermaidFences(markdown: string): Promise<string> {
  const renderer = new marked.Renderer();
  const originalCode = renderer.code.bind(renderer);
  renderer.code = (token) => {
    if ((token.lang ?? '').trim() === 'mermaid') {
      return `<div class="mermaid">${token.text}</div>`;
    }
    return originalCode(token);
  };
  return marked.parse(markdown, { renderer, async: false }) as string;
}

function wrapHtml(body: string, title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  ${interFontFaceCss()}
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    margin: 0;
    padding: 24px 28px;
    line-height: 1.5;
    font-size: 11pt;
  }
  h1, h2, h3, h4 { color: #111827; margin-top: 1.4em; }
  h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
  h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 4px; overflow: auto; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; font-size: 10pt; }
  th { background: #f3f4f6; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .mermaid { text-align: center; margin: 16px 0; page-break-inside: avoid; }
</style>
</head>
<body>
${body}
<script type="module">
  import mermaid from '${MERMAID_CDN}';
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
  window.mermaidReady = mermaid.run({ querySelector: '.mermaid' }).catch(err => {
    console.error('mermaid render error', err);
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
