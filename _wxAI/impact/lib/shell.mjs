// What a Bash command would change (SCOPE-137 Amendment A, FR-008a).
//
// The AI-edit hook checks edits made with the edit tools; this lets it check the same change made
// through Bash. It reads a command the way a shell would, well enough to find:
//   - files the command writes or deletes: redirects, tee, sed -i, perl -i, cp/mv destinations,
//     rm, truncate, git checkout/restore, and PowerShell Set-Content / Out-File / Add-Content;
//   - SQL sent through a database client (psql, mysql, sqlite3, sqlcmd, mongosh), inline or by -f.
// It does not run anything. A command it cannot read is treated as writing nothing it can name,
// so the hook stays silent rather than guessing.

// [SCOPE 137 / T018] BEGIN — Read a Bash command: files it writes or deletes, and SQL it runs (FR-008a)
const NOWHERE = /^(\/dev\/null|nul|\$null|&[12]|-)$/i;
const DB_CLIENT = /^(psql|mysql|mariadb|sqlite3|sqlcmd|mongosh|mongo)(\.exe)?$/i;

/** Remove here-document bodies: they are data written somewhere, not commands. */
function stripHeredocs(command) {
  const lines = command.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(lines[i]);
    if (!m) continue;
    const end = m[2];
    while (i + 1 < lines.length && lines[i + 1].trim() !== end) i++;
    i++; // the delimiter line
  }
  return out.join('\n');
}

/** Split into simple commands on ; && || | and newlines, outside quotes. */
function segments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '\n' || ch === ';' || (ch === '|' && command[i + 1] !== '|') || (ch === '&' && command[i + 1] === '&') || (ch === '|' && command[i + 1] === '|')) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      if ((ch === '&' || ch === '|') && command[i + 1] === ch) i++;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Shell words, quotes removed. Good enough for paths and flags; it does not expand anything.
 * The returned array carries `quoted`: the indexes of words that held quotes, which are never
 * redirects (a quoted "> note" is text, not an operator).
 */
function words(segment) {
  const out = [];
  const quoted = new Set();
  let cur = '';
  let quote = null;
  let any = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      any = true;
      continue;
    }
    // A redirect glued to the word before it (x>>b.txt) still starts its own word.
    if (ch === '>' && (cur || any) && !/^([12&]|[12&]?>)$/.test(cur)) {
      if (any) quoted.add(out.length);
      out.push(cur);
      cur = '>';
      any = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (any) quoted.add(out.length);
      if (cur || any) out.push(cur);
      cur = '';
      any = false;
      continue;
    }
    cur += ch;
  }
  if (any) quoted.add(out.length);
  if (cur || any) out.push(cur);
  out.quoted = quoted;
  return out;
}

const operands = (ws) => ws.filter((w) => !w.startsWith('-'));

/**
 * { writes: [path], deletes: [path], sql: [{ text, file? }] } for a Bash command. Paths are as
 * written in the command (relative to its directory, or absolute); the caller resolves them.
 */
export function readBashCommand(command) {
  const writes = new Set();
  const deletes = new Set();
  const sql = [];
  for (const seg of segments(stripHeredocs(String(command ?? '')))) {
    let ws = words(seg);
    const quoted = ws.quoted;
    // Redirects anywhere in the command: >file, > file, >>file, 1>file, &>file. Not 2> (errors).
    const rest = [];
    for (let i = 0; i < ws.length; i++) {
      const m = quoted.has(i) ? null : /^(?:1|&)?(>>?)(.*)$/.exec(ws[i]);
      if (m && !/^2>/.test(ws[i]) && !/^>&/.test(ws[i])) {
        const target = m[2] || ws[++i];
        if (target && !NOWHERE.test(target)) writes.add(target);
        continue;
      }
      if (/^2>>?/.test(ws[i])) {
        if (ws[i] === '2>' || ws[i] === '2>>') i++;
        continue;
      }
      rest.push(ws[i]);
    }
    ws = rest;
    // Skip leading env assignments and wrappers (sudo, env, time, npx).
    while (ws.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(ws[0]) || ['sudo', 'env', 'time', 'command', 'npx', 'exec'].includes(ws[0]))) ws.shift();
    if (!ws.length) continue;
    const cmd = ws[0].split(/[\\/]/).pop();
    const args = ws.slice(1);
    const ops = operands(args);
    switch (cmd.toLowerCase()) {
      case 'tee':
        ops.forEach((f) => writes.add(f));
        break;
      case 'sed':
      case 'gsed':
        if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
          // The script is the first operand unless given with -e / -f.
          const scripted = args.some((a) => a === '-e' || a === '-f' || a === '--expression' || a === '--file');
          const files = args.filter((a, i) => !a.startsWith('-') && !['-e', '-f', '--expression', '--file'].includes(args[i - 1]));
          (scripted ? files : files.slice(1)).forEach((f) => writes.add(f));
        }
        break;
      case 'perl':
        if (args.some((a) => /^-[a-zA-Z]*i/.test(a))) {
          const files = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-e' && args[i - 1] !== '-E');
          files.forEach((f) => writes.add(f));
        }
        break;
      case 'cp':
      case 'mv':
      case 'install':
        if (ops.length >= 2) writes.add(ops[ops.length - 1]);
        if (cmd === 'mv') ops.slice(0, -1).forEach((f) => deletes.add(f));
        break;
      case 'rm':
      case 'unlink':
      case 'del':
      case 'remove-item':
        ops.forEach((f) => deletes.add(f));
        break;
      case 'truncate':
        args.filter((a, i) => !a.startsWith('-') && !['-s', '--size'].includes(args[i - 1])).forEach((f) => writes.add(f));
        break;
      case 'git':
        if (['checkout', 'restore'].includes(ops[0])) {
          const dash = args.indexOf('--');
          (dash >= 0 ? args.slice(dash + 1) : ops.slice(1).filter((f) => /[./\\]/.test(f))).forEach((f) => writes.add(f));
        }
        break;
      case 'set-content':
      case 'add-content':
      case 'out-file': {
        const named = args.findIndex((a) => /^-(path|filepath|literalpath)$/i.test(a));
        const target = named >= 0 ? args[named + 1] : ops[0];
        if (target) writes.add(target);
        break;
      }
      default:
        break;
    }
    if (DB_CLIENT.test(cmd)) {
      const fIdx = args.findIndex((a) => a === '-f' || a === '--file' || a === '-i' || a === '-input');
      sql.push({ text: seg, ...(fIdx >= 0 && args[fIdx + 1] ? { file: args[fIdx + 1] } : {}) });
    }
  }
  return { writes: [...writes], deletes: [...deletes], sql };
}
// [SCOPE 137 / T018] END
