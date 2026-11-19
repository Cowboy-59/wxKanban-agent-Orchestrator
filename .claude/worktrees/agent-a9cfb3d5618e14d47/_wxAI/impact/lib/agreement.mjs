// The Change Impact agreement log, kit side (SCOPE-137 FR-013).
//
// Every agreement (a developer's Agree on their own edit, an approval of the
// AI's edit at an Impact Boundary) and every unattended crossing is sent to
// wxKanban through project.capture_event. When the MCP cannot be reached the
// record is appended to .wxai/impact-queue.jsonl and sent on the next call that
// can reach it, so an offline period loses nothing (SC-6). The queue is never
// trimmed except by a confirmed send.

import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 137 / T014] BEGIN — Agreement records: building one from a report (FR-013)
export const QUEUE_FILE = join('.wxai', 'impact-queue.jsonl');

const TYPE_FOR_KIND = {
  acknowledgment: 'change_impact_ack',
  approval: 'change_impact_approval',
  crossing: 'change_impact_crossing',
};

/** A stable fingerprint of a change: the files and their new contents. Binds an approval to it. */
export function changeHash(entries) {
  const h = createHash('sha256');
  for (const { file, content } of [...entries].sort((a, b) => a.file.localeCompare(b.file))) {
    h.update(file);
    h.update('\0');
    h.update(content ?? '');
    h.update('\0');
  }
  return h.digest('hex');
}

const pad = (s) => String(s).replace(/^SCOPE-/i, '').padStart(3, '0');

/**
 * The capture_event arguments for one agreement or crossing. `kind` decides the
 * event type, so a hand edit's self-agreement can only ever be stored as an
 * acknowledgment, never as an approval.
 */
export function buildAgreementEvent({ projectId, actor, kind, answer, attended, entryPoint, report, hash, commit, specId }) {
  const type = TYPE_FOR_KIND[kind];
  if (!type) throw new Error(`unknown agreement kind: ${kind}`);
  const c = report.classification;
  const reached = [...new Set(
    report.links.filter((l) => l.direction === 'dependent' && !String(l.to).includes(':')).map((l) => l.to),
  )];
  const scopes = [...new Set([...c.ownScopes, ...c.reasons.filter((r) => r.scope).map((r) => r.scope), ...(report.scopes?.reachedScopes ?? [])].map(pad))];
  const reasons = c.reasons.map((r) => ({ kind: r.kind, detail: String(r.detail ?? '').slice(0, 500) }));
  const metadata = {
    clientEventId: randomUUID(),
    kind,
    attended: kind === 'crossing' ? false : Boolean(attended),
    mode: c.mode,
    decision: c.decision === 'none' ? 'notify' : c.decision,
    answer,
    change: { files: report.changedFiles.slice(0, 200), hash, ...(commit ? { commit } : {}) },
    impact: { affected: report.summary.affected ?? reached.length, reasons: reasons.slice(0, 100), files: reached.slice(0, 500), ...(report.broad ? { broad: true } : {}) },
    scopes: scopes.slice(0, 100),
    entryPoint,
    occurredAt: new Date().toISOString(),
  };
  const verb = { acknowledgment: 'acknowledged', approval: answer === 'approve' ? 'approved' : 'declined', crossing: 'crossed' }[kind];
  const summary = `${actor} ${verb} a change to ${report.changedFiles.join(', ')}: ${metadata.impact.affected} affected` +
    (reasons.length ? `; ${reasons.map((r) => r.detail).join('; ')}` : '');
  return {
    projectId,
    type,
    source: entryPoint === 'cockpit' ? 'vscode' : 'cli',
    actor,
    rawContent: summary.slice(0, 4000),
    metadata,
    ...(specId ? { specId } : {}),
  };
}
// [SCOPE 137 / T014] END

// [SCOPE 137 / T014] BEGIN — Offline queue and resend (FR-013, SC-6)
export function queueAgreement(root, event) {
  const file = join(root, QUEUE_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ...event, metadata: { ...event.metadata, queued: true } }) + '\n');
}

export function readQueue(root) {
  const file = join(root, QUEUE_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return []; // a torn last line from a crash; the rest still resend
    }
  });
}

export const REJECTED_FILE = join('.wxai', 'impact-queue.rejected.jsonl');

/** A record the server refused as invalid: resending cannot help, and it must not block the rest. */
function setAside(root, event, reason) {
  const file = join(root, REJECTED_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ reason, event }) + '\n');
}

/**
 * Resend everything queued, in order. Stops at the first failure that means
 * "still offline" and keeps it and everything after it. A record the server
 * refuses is set aside in impact-queue.rejected.jsonl (kept, never deleted) so
 * it cannot block the queue. The rewrite is atomic, so a crash mid-flush can
 * resend a record but never drop one.
 */
export async function flushQueue(root, send) {
  const pending = readQueue(root);
  let sent = 0;
  let rejected = 0;
  for (const event of pending) {
    try {
      await send(event);
      sent++;
    } catch (e) {
      if (e?.permanent) {
        setAside(root, event, e.message);
        rejected++;
        sent++;
        continue;
      }
      break;
    }
  }
  if (sent > 0) {
    const file = join(root, QUEUE_FILE);
    const rest = pending.slice(sent);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, rest.map((e) => JSON.stringify(e)).join('\n') + (rest.length ? '\n' : ''));
    renameSync(tmp, file);
  }
  return { sent: sent - rejected, rejected, remaining: pending.length - sent };
}

/** Send one record, after the queue (oldest first). Unreachable → queued, never lost. */
export async function recordAgreement(root, event, send) {
  const flushed = await flushQueue(root, send);
  if (flushed.remaining > 0) {
    queueAgreement(root, event);
    return { sent: false, queued: true, flushed };
  }
  try {
    await send(event);
    return { sent: true, queued: false, flushed };
  } catch (e) {
    if (e?.permanent) {
      setAside(root, event, e.message);
      return { sent: false, queued: false, rejected: true, flushed, error: e.message };
    }
    queueAgreement(root, event);
    return { sent: false, queued: true, flushed, error: e instanceof Error ? e.message : String(e) };
  }
}
// [SCOPE 137 / T014] END

// [SCOPE 137 / T014] BEGIN — Hosted MCP transport for the agreement log (FR-013)
// MODIFIED-BY: [SCOPE 137 / T009] — general mcpCall (the hook also asks the sign-off dry run) and the kit project id
function envFileValue(file, key) {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`).exec(line);
    if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return null;
}

/** The kit's project file: `.wxkanban-project.json` (projectId, mcpBaseUrl). Null when absent. */
function kitProject(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.wxkanban-project.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** This project's wxKanban id, as the kit's other scripts read it. Null when not configured. */
export function projectIdFor(root) {
  return process.env.WXKANBAN_PROJECT_ID ?? kitProject(root)?.projectId ?? null;
}

/**
 * Where to send, and with what token: the same order the kit's other scripts
 * use (environment, the project's env file, ai-settings.json). The token is
 * read to send it and never printed. Null when none is configured.
 */
export function mcpConnection(root) {
  const token =
    process.env.WXKANBAN_API_TOKEN ??
    envFileValue(join(root, '.env'), 'WXKANBAN_API_TOKEN') ??
    (() => {
      try {
        const t = JSON.parse(readFileSync(join(root, 'ai-settings.json'), 'utf8'))?.mcpServers?.wxkanban?.env?.WXKANBAN_API_TOKEN;
        return t && t !== 'your_api_key_here' ? t : null;
      } catch {
        return null;
      }
    })();
  if (!token) return null;
  let base = process.env.WXKANBAN_MCP_URL ?? null;
  if (!base) {
    let b = kitProject(root)?.mcpBaseUrl ?? null;
    if (!b) {
      try {
        b = JSON.parse(readFileSync(join(root, '.wxai', 'project.json'), 'utf8'))?.kit?.mcpBaseUrl ?? null;
      } catch {
        // fall through to the default
      }
    }
    if (b) base = `${String(b).replace(/\/+$/, '')}/mcp`;
  }
  return { url: base ?? 'https://mcp.wxperts.com/mcp', token };
}

/**
 * Call one hosted MCP tool and return its parsed result. Throws on any failure;
 * a refusal (the tool rejected its input) is marked `permanent`, because sending
 * the same input again cannot succeed.
 */
export async function mcpCall(conn, name, args, { timeoutMs = 8000 } = {}) {
  if (!conn) throw new Error('no wxKanban token configured');
  const res = await fetch(conn.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${conn.token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = /^(event|data):/m.test(text)
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
    : text;
  const parsed = JSON.parse(body);
  if (parsed.error || parsed.result?.isError) {
    throw Object.assign(new Error(`${name} refused: ${JSON.stringify(parsed.error ?? parsed.result?.content?.[0]?.text ?? '').slice(0, 300)}`), { permanent: true });
  }
  const content = parsed.result?.content?.[0]?.text;
  try {
    return content ? JSON.parse(content) : parsed.result;
  } catch {
    return content;
  }
}

/** A send function for capture_event over the hosted MCP. Throws on any failure, so the record queues. */
export function mcpSender(conn, opts = {}) {
  return (event) => mcpCall(conn, 'project.capture_event', event, opts);
}
// [SCOPE 137 / T014] END
