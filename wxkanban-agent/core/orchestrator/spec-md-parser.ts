// Spec 019 — Markdown parser for the small set of fields dbpush needs from
// spec.md / plan.md / tests.md. Not a full Markdown AST; just regex
// extraction of the H1 title, bold-key metadata lines (e.g. `**Status**:
// approved`), and the full body for upserting as a project document.

export interface SpecMetadata {
  specNumber?: string;
  title?: string;
  status?: string;
  created?: string;
  dependsOn?: string;
}

export interface ParsedSpecMd {
  meta: SpecMetadata;
  body: string;
  headings: string[];
}

// Matches "# Spec 028: Title" or "# Spec 019 — Title" forms used across the
// canonical specs. The kit's createspecs handler also emits the simpler
// "# Spec 028: <featureName>" shape; both are supported.
const H1_SPEC_RE = /^#\s+Spec\s+(\d{3,})\s*[:\-—–]\s*(.+?)\s*$/im;
const H1_GENERIC_RE = /^#\s+(.+?)\s*$/m;
const META_LINE_RE = /^\*\*([\w\s]+)\*\*\s*[:：]\s*(.+?)\s*$/gm;
const HEADING_RE = /^##\s+(.+?)\s*$/gm;

export function parseSpecMd(content: string): ParsedSpecMd {
  const meta: SpecMetadata = {};

  const specMatch = content.match(H1_SPEC_RE);
  if (specMatch) {
    meta.specNumber = specMatch[1];
    meta.title = specMatch[2];
  } else {
    const generic = content.match(H1_GENERIC_RE);
    if (generic) meta.title = generic[1];
  }

  for (const m of content.matchAll(META_LINE_RE)) {
    const key = (m[1] ?? '').trim().toLowerCase().replace(/\s+/g, '');
    const val = (m[2] ?? '').trim().replace(/^`|`$/g, '');
    if (key === 'specnumber' && !meta.specNumber) meta.specNumber = val;
    else if (key === 'status') meta.status = val;
    else if (key === 'created') meta.created = val;
    else if (key === 'dependson') meta.dependsOn = val;
  }

  const headings: string[] = [];
  for (const m of content.matchAll(HEADING_RE)) {
    headings.push((m[1] ?? '').trim());
  }

  return { meta, body: content, headings };
}

// True iff the entry name looks like a canonical spec folder ("NNN-<slug>")
// — used by dbpush to filter the `specs/` directory. Skips Project-Scope/,
// main/, compliance docs, and other top-level files that share the dir.
export function isSpecFolderName(name: string): boolean {
  return /^\d{3,}-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}
