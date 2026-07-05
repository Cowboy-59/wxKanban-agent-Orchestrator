import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type * as vscode from 'vscode'; // type-only — no runtime dependency, keeps this module testable

const SECRET_PREFIX = 'wxkanban.apiToken';

// [SCOPE 042 / T013] BEGIN — secretKey (per-project SecretStorage key)
// Token is keyed by projectId so opening a second project (or multi-root) never
// reuses one project's token for another — each project has its own scoped token.
function secretKey(projectId: string): string {
  return `${SECRET_PREFIX}:${projectId}`;
}
// [SCOPE 042 / T013] END

// [SCOPE 042 / T013] BEGIN — resolveToken (SecretStorage first, else bootstrap + cache)
// T013 — SecretStorage is the source of truth once seeded. On first run we
// bootstrap from the kit's own locations and cache the result in SecretStorage.
export async function resolveToken(
  secrets: vscode.SecretStorage,
  projectRoot: string,
  projectId: string,
): Promise<string | null> {
  const key = secretKey(projectId);
  const cached = await secrets.get(key);
  if (cached) return cached;

  const bootstrapped = bootstrapTokenFromFiles(projectRoot);
  if (bootstrapped) {
    await secrets.store(key, bootstrapped);
    return bootstrapped;
  }
  return null;
}
// [SCOPE 042 / T013] END

// [SCOPE 042 / T013] BEGIN — storeToken / clearToken
export async function storeToken(secrets: vscode.SecretStorage, projectId: string, token: string): Promise<void> {
  await secrets.store(secretKey(projectId), token);
}

export async function clearToken(secrets: vscode.SecretStorage, projectId: string): Promise<void> {
  await secrets.delete(secretKey(projectId));
}
// [SCOPE 042 / T013] END

// [SCOPE 042 / T013] BEGIN — bootstrapTokenFromFiles (kit token locations, precedence-ordered)
// Precedence mirrors the kit's resolveApiToken: .wxai/project.json kit.apiToken,
// then .env WXKANBAN_API_TOKEN, then legacy .wxkanban-project.json apiToken.
// (The kit reads WXKANBAN_API_TOKEN from process.env, but VS Code does not load
// .env, so we parse the .env file directly.)
export function bootstrapTokenFromFiles(projectRoot: string): string | null {
  const wxai = readJson(join(projectRoot, '.wxai', 'project.json')) as
    | { kit?: { apiToken?: unknown } }
    | null;
  if (typeof wxai?.kit?.apiToken === 'string') return wxai.kit.apiToken;

  const fromEnv = readEnvToken(join(projectRoot, '.env'));
  if (fromEnv) return fromEnv;

  const legacy = readJson(join(projectRoot, '.wxkanban-project.json')) as { apiToken?: unknown } | null;
  if (typeof legacy?.apiToken === 'string') return legacy.apiToken;

  return null;
}
// [SCOPE 042 / T013] END

// [SCOPE 042 / T013] BEGIN — file readers (JSON + .env token)
function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function readEnvToken(path: string): string | null {
  return readEnvValue(path, 'WXKANBAN_API_TOKEN');
}

// Read a single `NAME=value` from a .env file (quotes stripped). Generic so the
// chat consumer-secret bootstrap can reuse it.
function readEnvValue(path: string, name: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const re = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`);
    for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
      const m = re.exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return null;
}
// [SCOPE 042 / T013] END

// [SCOPE 079 / T01] BEGIN — YappChat community-help consumer credential + chat user
// The consumer secret authenticates the Cockpit to YappChat's POST /api/consumer/session.
// It is app-wide (one wxKanban->YappChat credential), NOT per-project, so it uses a
// single global SecretStorage key. Held only in the extension host; never sent to any
// webview. Bootstraps once from `.env WXKANBAN_CONSUMER_SECRET` for local dev, then
// SecretStorage is the source of truth.
const CHAT_SECRET_KEY = 'wxkanban.chatConsumerSecret';
const CHAT_USER_KEY = 'wxkanban.chatUser';

export async function storeChatCredential(secrets: vscode.SecretStorage, secret: string): Promise<void> {
  await secrets.store(CHAT_SECRET_KEY, secret);
}

export async function clearChatCredential(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(CHAT_SECRET_KEY);
}

export async function resolveChatCredential(
  secrets: vscode.SecretStorage,
  projectRoot: string,
): Promise<string | null> {
  const cached = await secrets.get(CHAT_SECRET_KEY);
  if (cached) return cached;

  const fromEnv = readEnvValue(join(projectRoot, '.env'), 'WXKANBAN_CONSUMER_SECRET');
  if (fromEnv) {
    await secrets.store(CHAT_SECRET_KEY, fromEnv);
    return fromEnv;
  }
  return null;
}

export interface ChatUser {
  email: string;
  displayName: string;
}

export async function getChatUser(secrets: vscode.SecretStorage): Promise<ChatUser | null> {
  const raw = await secrets.get(CHAT_USER_KEY);
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Partial<ChatUser>;
    if (typeof u.email === 'string' && u.email) {
      return { email: u.email, displayName: typeof u.displayName === 'string' ? u.displayName : u.email };
    }
  } catch {
    /* ignore malformed */
  }
  return null;
}

export async function storeChatUser(secrets: vscode.SecretStorage, user: ChatUser): Promise<void> {
  await secrets.store(CHAT_USER_KEY, JSON.stringify(user));
}
// [SCOPE 079 / T01] END
