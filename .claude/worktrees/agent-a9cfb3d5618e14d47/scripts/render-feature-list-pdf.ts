// One-off: render docs-workspace/wxKanban-Feature-List.md to a branded PDF via the
// project's own MarkdownPdfRenderer (marked + puppeteer, wxKanban footer + metadata).
//   npx tsx scripts/render-feature-list-pdf.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MarkdownPdfRenderer } from "../src/server/services/MarkdownPdfRenderer.js";

const mdPath = join(process.cwd(), "docs-workspace", "wxKanban-Feature-List.md");
const outPath = join(process.cwd(), "docs-workspace", "wxKanban-Feature-List.pdf");

const md = readFileSync(mdPath, "utf-8");
const pdf = await MarkdownPdfRenderer.renderToPdf(md, "wxKanban — Feature List");
writeFileSync(outPath, pdf);
console.log("wrote", outPath, pdf.length, "bytes");
