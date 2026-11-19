// SCOPE-137 / T011 (FR-010) — the Cockpit runs the kit's Change Impact scripts.
//
// The engine lives in the kit (`_wxAI/impact/`), not in the extension, so the Cockpit, the
// Claude Code hook and the CLI all answer from one implementation. Each call is a short `node`
// run in the project root. A missing kit, a missing `node`, or a failing script resolves to null:
// the views simply show nothing new, and the editor is never disturbed.
import { execFile } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FenceUsage, ImpactReport } from './impactModel.js';

// [SCOPE 137 / T011] BEGIN — Kit script runner for Change Impact (FR-010)
// MODIFIED-BY: [SCOPE 137 / T022] — queueChatRelay, for the self-opening agree panel (Amendment C, FR-010a)
const KIT = '_wxAI/impact';

export function hasImpactKit(root: string): boolean {
  return existsSync(join(root, KIT, 'change-impact.mjs'));
}

function runNode(root: string, script: string, args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = 20_000): Promise<{ code: number; stdout: string } | null> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [join(root, KIT, script), ...args],
      { cwd: root, env: { ...process.env, ...env }, timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code !== 'number') return resolve(null);
        resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout) });
      },
    );
  });
}

/**
 * Check one saved file. `before` is the file as it was just before the save (null for a new
 * file), so possible data loss is judged on what THIS save changed. Writes .wxai/impact.json.
 */
export async function checkSavedFile(root: string, rel: string, before: string | null): Promise<ImpactReport | null> {
  const dir = mkdtempSync(join(tmpdir(), 'wxk-impact-'));
  try {
    const args = ['--changed', rel, '--root', root, '--quiet', '--out', join(root, '.wxai', 'impact.json')];
    const beforeFile = join(dir, 'before');
    writeFileSync(beforeFile, before ?? '');
    args.push('--before', beforeFile);
    const r = await runNode(root, 'change-impact.mjs', args);
    if (!r) return null;
    return JSON.parse(readFileSync(join(root, '.wxai', 'impact.json'), 'utf8')) as ImpactReport;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function fenceUsage(root: string, rel: string): Promise<FenceUsage[] | null> {
  const r = await runNode(root, 'fence-usage.mjs', [rel, '--root', root]);
  if (!r || r.code !== 0) return null;
  try {
    return (JSON.parse(r.stdout) as { fences: FenceUsage[] }).fences;
  } catch {
    return null;
  }
}

/** Record Agree or Undo for a hand edit. The token goes in the environment, never on the command line. */
export async function acknowledgeHandEdit(
  root: string,
  opts: { answer: 'agree' | 'undo'; hash: string; actor: string; token: string | null },
): Promise<{ ok: boolean; sent?: boolean; queued?: boolean; duplicate?: boolean; skipped?: string; error?: string } | null> {
  const env: NodeJS.ProcessEnv = opts.token ? { WXKANBAN_API_TOKEN: opts.token } : {};
  const r = await runNode(root, 'acknowledge.mjs', ['--root', root, '--answer', opts.answer, '--hash', opts.hash, '--actor', opts.actor], env);
  if (!r) return null;
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}');
  } catch {
    return null;
  }
}

/**
 * Queue the agree panel's content for the next Claude Code tool call to relay into chat
 * (Amendment C / T022, FR-010a). Fire-and-forget — a missed relay never blocks or delays the
 * panel opening; it only adds a second place the same content reaches.
 */
export function queueChatRelay(root: string, opts: { hash: string; file: string }): void {
  void runNode(root, 'queue-chat-relay.mjs', ['--root', root, '--hash', opts.hash, '--file', opts.file]);
}

/** 'current' | 'stale' | 'missing', or null when the kit has no installer. */
export async function hookStatus(root: string): Promise<'current' | 'stale' | 'missing' | null> {
  if (!existsSync(join(root, KIT, 'install-hook.mjs'))) return null;
  const r = await runNode(root, 'install-hook.mjs', ['--check', '--root', root]);
  if (!r) return null;
  const m = /is (current|stale|missing)/.exec(r.stdout);
  return (m?.[1] as 'current' | 'stale' | 'missing' | undefined) ?? null;
}

export async function installHook(root: string, uninstall = false): Promise<boolean> {
  const r = await runNode(root, 'install-hook.mjs', [...(uninstall ? ['--uninstall'] : []), '--root', root]);
  return Boolean(r && r.code === 0);
}
// [SCOPE 137 / T011] END
