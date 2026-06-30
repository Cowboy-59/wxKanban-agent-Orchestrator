// SCOPE-082 — public surface of @wxkanban/watermark.
// Shared, single source of the generated-output watermark used by mcp-server
// (lifecycle/devplan generators), src/server (app generators + PDF renderer),
// and — via a byte-compatible Python port — the conversion skills.

export {
  stampMarkdown,
  verifyMarkdown,
  buildAttributionLine,
  WATERMARK_URL,
  WATERMARK_HOST,
  WATERMARK_SIG_PREFIX,
  type WatermarkKind,
  type StampOptions,
  type WatermarkInfo,
} from './stamp.js';

export {
  encodeZeroWidth,
  decodeZeroWidth,
  stripZeroWidth,
  ZW_BIT0,
  ZW_BIT1,
  ZW_SENTINEL,
} from './zero-width.js';
