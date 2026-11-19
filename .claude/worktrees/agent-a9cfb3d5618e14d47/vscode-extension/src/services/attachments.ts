import * as vscode from 'vscode';
import {
  ALLOWED_EXTENSIONS,
  MAX_FILES,
  MAX_READ_BYTES,
  MAX_TOTAL_BYTES,
  isAllowedExtension,
  looksBinary,
  redactSecrets,
  tailSlice,
  type FeedbackAttachment,
} from './attachmentText.js';

// [SCOPE 043 / T026] BEGIN — attachment I/O (Amendment E, FR-023)
// The dialog + filesystem half. All of it runs in the extension host: the
// webview never touches the filesystem and never holds the content (see
// providers/feedbackPanel.ts). Bounding and redaction live in attachmentText.ts
// so they stay testable without an Extension Development Host.
//
// Order of operations is deliberate — reject binary, truncate, THEN redact.
// Redacting first would run every pattern across a file that may be tens of
// megabytes, to protect bytes that are about to be discarded.

export type { FeedbackAttachment, AttachmentChip } from './attachmentText.js';
export { toChip, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './attachmentText.js';

export interface ReadResult {
  ok: boolean;
  attachment?: FeedbackAttachment;
  error?: string;
}

/**
 * Read, bound, and scrub one picked file.
 *
 * Never throws for a submitter-caused problem — an unreadable or unsuitable file
 * comes back as `{ok:false, error}` so the capture panel can say so without
 * losing the report the submitter has already typed (FR-023).
 */
export async function readAttachment(uri: vscode.Uri): Promise<ReadResult> {
  const name = uri.path.split('/').pop() ?? 'attachment';
  if (!isAllowedExtension(name)) {
    return {
      ok: false,
      error: `"${name}" is not a text format we accept (${ALLOWED_EXTENSIONS.join(', ')}).`,
    };
  }

  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(uri);
  } catch (err) {
    return { ok: false, error: `could not read "${name}" — ${(err as Error).message}` };
  }
  if (stat.size > MAX_READ_BYTES) {
    return {
      ok: false,
      error: `"${name}" is ${Math.round(stat.size / 1024 / 1024)} MB — too large to attach. Trim it first.`,
    };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await vscode.workspace.fs.readFile(uri));
  } catch (err) {
    return { ok: false, error: `could not read "${name}" — ${(err as Error).message}` };
  }

  if (looksBinary(buf)) {
    return {
      ok: false,
      error: `"${name}" looks like a binary file — only text attachments are supported.`,
    };
  }

  const { text, truncated } = tailSlice(buf);
  const { text: scrubbed, redactions } = redactSecrets(text);

  return {
    ok: true,
    attachment: { name, bytes: stat.size, truncated, redactions, content: scrubbed },
  };
}
// [SCOPE 043 / T026] END

// [SCOPE 043 / T026] BEGIN — pickAttachments (dialog + running total enforcement)
/**
 * Prompt for files and return the ones that read cleanly, respecting the
 * per-report ceilings against what is ALREADY attached. Problems are reported
 * back rather than thrown — a rejected file must not cost the submitter the
 * report they have typed.
 */
export async function pickAttachments(
  existing: FeedbackAttachment[],
): Promise<{ added: FeedbackAttachment[]; problems: string[] }> {
  const problems: string[] = [];
  const room = MAX_FILES - existing.length;
  if (room <= 0) {
    return { added: [], problems: [`You can attach at most ${MAX_FILES} files.`] };
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Attach',
    title: 'Attach a log or text file to your report',
    filters: { 'Text and log files': [...ALLOWED_EXTENSIONS] },
  });
  if (!picked || picked.length === 0) return { added: [], problems };

  const added: FeedbackAttachment[] = [];
  let total = existing.reduce((n, a) => n + a.content.length, 0);

  for (const uri of picked) {
    if (added.length >= room) {
      problems.push(`Only ${MAX_FILES} files can be attached — the rest were skipped.`);
      break;
    }
    const res = await readAttachment(uri);
    if (!res.ok || !res.attachment) {
      problems.push(res.error ?? 'could not read that file.');
      continue;
    }
    if (total + res.attachment.content.length > MAX_TOTAL_BYTES) {
      problems.push(
        `"${res.attachment.name}" would exceed the ${Math.round(MAX_TOTAL_BYTES / 1024)} KB total — skipped.`,
      );
      continue;
    }
    total += res.attachment.content.length;
    added.push(res.attachment);
  }

  return { added, problems };
}
// [SCOPE 043 / T026] END
