// SCOPE-082 — wxKanban version string recorded in the generated-output
// watermark from the hosted-MCP context. Sourced from WXKANBAN_VERSION when set
// (so ops can pin it to the deployed release), else the mcp-server package
// version. Used only for the watermark provenance field — branding, not a
// security control.

// [SCOPE 082 / T005] BEGIN — WXKANBAN_VERSION (watermark provenance, MCP context)
export const WXKANBAN_VERSION = process.env['WXKANBAN_VERSION'] ?? '0.1.1';
// [SCOPE 082 / T005] END
