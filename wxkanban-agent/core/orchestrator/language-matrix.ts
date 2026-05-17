export type LanguageCommentStyle = "line" | "block-c" | "html" | "hash";

export interface LanguageEntry {
  commentStyle: LanguageCommentStyle;
  lineToken?: string;
  blockOpen?: string;
  blockClose?: string;
  jsxForm?: { open: string; close: string };
  suppressed?: boolean;
}

export const LANGUAGE_MATRIX: Record<string, LanguageEntry> = {
  ".ts": { commentStyle: "line", lineToken: "//" },
  ".tsx": {
    commentStyle: "line",
    lineToken: "//",
    jsxForm: { open: "{/*", close: "*/}" },
  },
  ".js": { commentStyle: "line", lineToken: "//" },
  ".jsx": {
    commentStyle: "line",
    lineToken: "//",
    jsxForm: { open: "{/*", close: "*/}" },
  },
  ".mjs": { commentStyle: "line", lineToken: "//" },
  ".cjs": { commentStyle: "line", lineToken: "//" },
  ".sql": { commentStyle: "line", lineToken: "--" },
  ".css": { commentStyle: "block-c", blockOpen: "/*", blockClose: "*/" },
  ".scss": { commentStyle: "block-c", blockOpen: "/*", blockClose: "*/" },
  ".md": { commentStyle: "html", blockOpen: "<!--", blockClose: "-->" },
  ".yaml": { commentStyle: "hash", lineToken: "#" },
  ".yml": { commentStyle: "hash", lineToken: "#" },
  ".html": { commentStyle: "html", blockOpen: "<!--", blockClose: "-->" },
  ".json": { commentStyle: "line", suppressed: true },
};

export class UnknownExtensionError extends Error {
  constructor(public readonly extension: string) {
    super(
      `Unknown file extension '${extension}'. Add it to LANGUAGE_MATRIX (spec 026 FR-005) before processing.`,
    );
    this.name = "UnknownExtensionError";
  }
}

export function getLanguageEntry(extension: string): LanguageEntry {
  const entry = LANGUAGE_MATRIX[extension.toLowerCase()];
  if (!entry) throw new UnknownExtensionError(extension);
  return entry;
}

export function isSuppressed(extension: string): boolean {
  return !!LANGUAGE_MATRIX[extension.toLowerCase()]?.suppressed;
}

export function buildFenceLine(
  extension: string,
  text: string,
  inJsx = false,
): string {
  const entry = getLanguageEntry(extension);
  if (entry.suppressed) {
    throw new Error(
      `Cannot build fence line for suppressed extension '${extension}' (e.g. .json).`,
    );
  }
  if (inJsx && entry.jsxForm) {
    return `${entry.jsxForm.open} ${text} ${entry.jsxForm.close}`;
  }
  switch (entry.commentStyle) {
    case "line":
    case "hash":
      return `${entry.lineToken} ${text}`;
    case "block-c":
    case "html":
      return `${entry.blockOpen} ${text} ${entry.blockClose}`;
  }
}
