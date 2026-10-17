// Nightly Testing: installing the run as the Designated Agent (SCOPE-140 FR-011).
//
//   --install    registers the nightly run with the machine's scheduler, to run as the Designated
//                Agent: Task Scheduler on Windows, a systemd timer (or cron) on Linux, launchd on
//                macOS. On a developer machine (the fallback) it also asks to wake the machine.
//   --uninstall  removes everything --install created, and reports anything left.
//
// While the run is going on a fallback machine it holds a keep-awake request (caffeinate,
// systemd-inhibit, or a Windows execution-state request), released when the run ends.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// [SCOPE 140 / T011] BEGIN — Scheduler entries per platform, and install / uninstall (FR-011)
/** A short, stable id per project, so two projects on one machine never collide. */
export const jobId = (root) => `wxkanban-nightly-${createHash('sha256').update(String(root).toLowerCase()).digest('hex').slice(0, 10)}`;

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What --install would create. Pure: tests read it, and --install --dry-run prints it. */
export function installPlan({ root, script, node = process.execPath, at = '02:00', platform = process.platform, fallback = false, agentUser = null, home = homedir() }) {
  const id = jobId(root);
  const [hh, mm] = String(at).split(':').map((x) => Number(x));
  if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) throw new Error(`nightly.schedule "${at}" is not a time like 02:00`);
  const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const args = [script, 'run', '--root', root, '--scheduled'];
  if (platform === 'win32') {
    const xml = [
      '<?xml version="1.0" encoding="UTF-16"?>',
      '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
      `  <RegistrationInfo><Description>wxKanban nightly testing for ${xmlEscape(root)}</Description></RegistrationInfo>`,
      `  <Triggers><CalendarTrigger><StartBoundary>2026-01-01T${time}:00</StartBoundary><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>`,
      agentUser ? `  <Principals><Principal id="Agent"><UserId>${xmlEscape(agentUser)}</UserId><LogonType>Password</LogonType></Principal></Principals>` : '  <Principals><Principal id="Agent"><LogonType>InteractiveToken</LogonType></Principal></Principals>',
      `  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><WakeToRun>${fallback ? 'true' : 'false'}</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><StartWhenAvailable>true</StartWhenAvailable><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries></Settings>`,
      `  <Actions Context="Agent"><Exec><Command>${xmlEscape(node)}</Command><Arguments>${args.map((a) => `"${xmlEscape(a)}"`).join(' ')}</Arguments><WorkingDirectory>${xmlEscape(root)}</WorkingDirectory></Exec></Actions>`,
      '</Task>',
    ].join('\r\n');
    return { platform, id, kind: 'task-scheduler', files: [], xml, create: ['schtasks', ['/Create', '/TN', id, '/XML', '<xml file>', '/F', ...(agentUser ? ['/RU', agentUser, '/RP', '<password from the secret store>'] : [])]], remove: ['schtasks', ['/Delete', '/TN', id, '/F']], query: ['schtasks', ['/Query', '/TN', id]] };
  }
  if (platform === 'darwin') {
    const label = `com.wxperts.${id}`;
    const plist = join(home, 'Library', 'LaunchAgents', `${label}.plist`);
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      `  <key>Label</key><string>${label}</string>`,
      `  <key>ProgramArguments</key><array>${[node, ...args].map((a) => `<string>${xmlEscape(a)}</string>`).join('')}</array>`,
      `  <key>WorkingDirectory</key><string>${xmlEscape(root)}</string>`,
      `  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hh}</integer><key>Minute</key><integer>${mm}</integer></dict>`,
      '</dict></plist>',
    ].join('\n');
    return { platform, id, kind: 'launchd', files: [{ path: plist, body }], create: ['launchctl', ['load', '-w', plist]], remove: ['launchctl', ['unload', '-w', plist]], query: ['launchctl', ['list', label]], note: fallback ? `To wake the machine for the run: sudo pmset repeat wakeorpoweron MTWRFSU ${time}:00 (needs an administrator; --uninstall does not undo it).` : null };
  }
  // Linux: a systemd user timer when systemd is present, else a marked crontab line.
  const unitDir = join(home, '.config', 'systemd', 'user');
  const service = [
    '[Unit]', `Description=wxKanban nightly testing for ${root}`, '',
    '[Service]', 'Type=oneshot', `WorkingDirectory=${root}`,
    `ExecStart=${fallback ? '/usr/bin/systemd-inhibit --what=sleep --why="wxKanban nightly run" ' : ''}${[node, ...args].map((a) => `"${a}"`).join(' ')}`,
  ].join('\n');
  const timer = ['[Unit]', `Description=wxKanban nightly testing timer (${id})`, '', '[Timer]', `OnCalendar=*-*-* ${time}:00`, 'Persistent=true', fallback ? 'WakeSystem=true' : 'WakeSystem=false', '', '[Install]', 'WantedBy=timers.target'].join('\n');
  const cronLine = `${mm} ${hh} * * * cd "${root}" && "${node}" ${args.map((a) => `"${a}"`).join(' ')} # ${id}`;
  return {
    platform,
    id,
    kind: 'systemd',
    files: [{ path: join(unitDir, `${id}.service`), body: service }, { path: join(unitDir, `${id}.timer`), body: timer }],
    create: ['systemctl', ['--user', 'enable', '--now', `${id}.timer`]],
    remove: ['systemctl', ['--user', 'disable', '--now', `${id}.timer`]],
    query: ['systemctl', ['--user', 'list-timers', `${id}.timer`, '--no-legend']],
    cron: { line: cronLine, marker: `# ${id}` },
    note: agentUser ? `To run as the Designated Agent "${agentUser}", install while signed in as that account (systemd user units run as their owner), and enable lingering: loginctl enable-linger ${agentUser}.` : null,
  };
}

const exec = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });

/** Create the scheduler entry. `password` is read from the secret store by the caller, never logged. */
export function install(plan, { password = null, run = exec, hasSystemd = () => run('systemctl', ['--user', '--version']).status === 0 } = {}) {
  if (plan.kind === 'task-scheduler') {
    const file = join(tmpdir(), `${plan.id}.xml`);
    writeFileSync(file, '﻿' + plan.xml, 'utf16le');
    const args = ['/Create', '/TN', plan.id, '/XML', file, '/F'];
    if (plan.create[1].includes('/RU')) args.push('/RU', plan.create[1][plan.create[1].indexOf('/RU') + 1], '/RP', password ?? '');
    const r = run('schtasks', args);
    rmSync(file, { force: true });
    return { ok: r.status === 0, detail: (r.stdout || r.stderr || '').trim().split('\n')[0] };
  }
  if (plan.kind === 'systemd' && !hasSystemd()) {
    const current = run('crontab', ['-l']).stdout ?? '';
    const lines = current.split('\n').filter((l) => l && !l.endsWith(plan.cron.marker));
    const r = spawnSync('crontab', ['-'], { input: [...lines, plan.cron.line].join('\n') + '\n', encoding: 'utf8' });
    return { ok: r.status === 0, detail: 'installed as a crontab line', cron: true };
  }
  for (const f of plan.files) {
    mkdirSync(join(f.path, '..'), { recursive: true });
    writeFileSync(f.path, f.body + '\n');
  }
  if (plan.kind === 'systemd') run('systemctl', ['--user', 'daemon-reload']);
  const r = run(plan.create[0], plan.create[1]);
  return { ok: r.status === 0, detail: (r.stdout || r.stderr || '').trim().split('\n')[0] };
}

/** Remove everything install created, then report what, if anything, is left (no residue). */
export function uninstall(plan, { run = exec } = {}) {
  run(plan.remove[0], plan.remove[1]);
  for (const f of plan.files) rmSync(f.path, { force: true });
  if (plan.kind === 'systemd') {
    run('systemctl', ['--user', 'daemon-reload']);
    const current = run('crontab', ['-l']);
    if (current.status === 0 && String(current.stdout).includes(plan.cron.marker)) {
      const kept = String(current.stdout).split('\n').filter((l) => l && !l.endsWith(plan.cron.marker));
      spawnSync('crontab', ['-'], { input: kept.join('\n') + (kept.length ? '\n' : ''), encoding: 'utf8' });
    }
  }
  return residue(plan, { run });
}

/** What of this job still exists: scheduler entry, files, crontab line. Empty means clean. */
export function residue(plan, { run = exec } = {}) {
  const left = [];
  const q = run(plan.query[0], plan.query[1]);
  if (q.status === 0 && String(q.stdout).trim() && (plan.kind !== 'systemd' || String(q.stdout).includes(plan.id))) left.push(`scheduler entry ${plan.id}`);
  for (const f of plan.files) if (existsSync(f.path)) left.push(f.path);
  if (plan.kind === 'systemd') {
    const c = run('crontab', ['-l']);
    if (c.status === 0 && String(c.stdout).includes(plan.cron.marker)) left.push('crontab line');
  }
  return left;
}
// [SCOPE 140 / T011] END

// [SCOPE 140 / T011] BEGIN — Keep the fallback machine awake during the run only (FR-011)
/**
 * Start a keep-awake request and return a release function. Nothing is held on a dedicated UAT
 * server. On Windows a hidden PowerShell holds an execution-state request until it is killed.
 */
export function holdAwake({ platform = process.platform, fallback = true, start = spawn } = {}) {
  if (!fallback) return { release: () => {}, how: 'not needed on a dedicated UAT server' };
  let child = null;
  let how = '';
  try {
    if (platform === 'darwin') {
      child = start('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', windowsHide: true });
      how = 'caffeinate';
    } else if (platform === 'win32') {
      const ps = 'Add-Type -Name P -Namespace W -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);\'; [W.P]::SetThreadExecutionState(0x80000001) | Out-Null; while ($true) { Start-Sleep -Seconds 60 }';
      child = start('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', windowsHide: true });
      how = 'Windows execution-state request';
    } else {
      child = start('systemd-inhibit', ['--what=sleep', '--why=wxKanban nightly run', 'sleep', 'infinity'], { stdio: 'ignore' });
      how = 'systemd-inhibit';
    }
    child.on?.('error', () => {});
  } catch {
    return { release: () => {}, how: 'keep-awake unavailable on this machine' };
  }
  return { release: () => child?.kill?.(), how };
}

export const readPlanFile = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
// [SCOPE 140 / T011] END
