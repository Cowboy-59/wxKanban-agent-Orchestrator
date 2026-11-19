#!/usr/bin/env node
// Onboarding Videos for wxHelpGenerate --video (SCOPE-139).
//
// Each Teaching Skill (SCOPE-138 --teach) becomes a short branded video of its process: Playwright
// replays the lesson's steps in UAT at human speed and records the screen and every click; HyperFrames
// (Apache 2.0, installed on first use at a pinned version) composes the footage with an oversized
// cursor, highlights, captions and local Kokoro narration from the lesson text, a chapter per step and
// an end card. Rendering is local, at no per-video cost; no footage goes to wxKanban.
//
//   node video.mjs check   [--workspace docs-workspace] [--address <uat url>]   preflight and guards; writes nothing
//   node video.mjs attest  --address <uat url> --answer yes|no [--by <name>]    the demo-data attestation
//   node video.mjs login   --address <uat url>        sign in once in a visible browser; the session is saved for recording
//   node video.mjs record  [--address <uat url>] [--stale] [--only <lesson>] [--app-version x.y.z]
//   node video.mjs stale                               which videos a change has made stale; writes nothing
//
// Recording happens on a UAT address only, and for a customer app only after a "yes" to "Does this
// UAT hold demo data only?" for that address. Video frames cannot be scanned for personal data, so
// these two checks ARE the protection: no flag skips them.
//
// This file is identical in .claude/skills/wxHelpGenerate/scripts/ and
// _wxAI/skills/wxHelpGenerate/scripts/; it finds the project root itself.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyAddress, readManifest, readStale } from './teach.mjs';

// [SCOPE 139 / T002] BEGIN — The recording environment guard and web-apps-only (FR-002, FR-011)
export const PINNED_HYPERFRAMES = '0.8.113';
export const VIDEOS_MANIFEST = '.videos.json';
export const DEFAULT_OUT = join('docs', 'onboarding-videos');

/** Record only on a UAT address. Production-listed and unlisted addresses are refused, with how to fix. */
export function recordingGuard(address, environments) {
  if (!address) return { ok: false, classification: null, reason: 'no recording address given (--address, or video.address in docs-workspace/config.json)' };
  // classifyAddress (SPEC-138) answers "production" for anything not on the UAT list; asking it
  // about each list alone tells Production apart from unlisted for the message.
  const isUat = classifyAddress(address, environments) === 'uat';
  if (isUat) return { ok: true, classification: 'uat' };
  const onProd = (environments?.production ?? []).some((a) => classifyAddress(address, { production: [a], uat: [] }) === 'production' && classifyAddress(address, { uat: [a] }) === 'uat');
  const kind = onProd ? 'on the Production list' : 'on neither list, so it is treated as Production';
  return {
    ok: false,
    classification: onProd ? 'production' : 'unlisted',
    reason: `Recording refused: ${safeOrigin(address)} is ${kind}. Videos are recorded in UAT only. To add a UAT address: node teach.mjs env --uat <url> --production <url>`,
  };
}

function safeOrigin(raw) {
  try {
    return new URL(String(raw)).origin;
  } catch {
    return '(unreadable address)';
  }
}

/** The app types stack.md records. Video covers web apps only. */
export function appTypes(root) {
  try {
    const m = /\*\*Application types?:\*\*\s*(.+)/i.exec(readFileSync(join(root, 'stack.md'), 'utf8'));
    return m ? m[1].split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function webOnlyCheck(types) {
  if (!types) return { ok: true, note: 'no stack.md: assumed to be a web app' };
  if (types.includes('web')) {
    const others = types.filter((t) => t !== 'web');
    return { ok: true, note: others.length ? `video covers the web app only; ${others.join(' and ')} video is reserved for a future scope` : null };
  }
  return { ok: false, reason: `Onboarding videos cover web apps only. This project is ${types.join(', ')}; desktop and mobile video is reserved for a future scope. Nothing was recorded.` };
}
// [SCOPE 139 / T002] END

// [SCOPE 139 / T003] BEGIN — The demo-data attestation, per UAT address (FR-003)
export const ATTESTATION_QUESTION = 'Does this UAT hold demo data only?';

const configFile = (workspace) => join(workspace, 'config.json');
export const readConfig = (workspace) => (existsSync(configFile(workspace)) ? JSON.parse(readFileSync(configFile(workspace), 'utf8')) : {});

function writeConfig(workspace, config) {
  mkdirSync(workspace, { recursive: true });
  writeFileSync(configFile(workspace), JSON.stringify(config, null, 2) + '\n');
}

/** The attestation key is the address's origin: a different UAT address is asked again. */
export const attestationKey = (address) => safeOrigin(address);

/**
 * Whether recording may proceed for this address. A project that seeds its own demo company
 * (video.demoSeed, wxKanban's own videos) does not ask; it seeds instead.
 */
export function attestationStatus(config, address) {
  if (config.video?.demoSeed?.command) return { ok: true, kind: 'seeded', detail: 'a seeded demo company (video.demoSeed)' };
  const a = config.video?.attestations?.[attestationKey(address)];
  if (!a) return { ok: false, kind: 'missing', detail: `not answered for ${attestationKey(address)}: ${ATTESTATION_QUESTION} (node video.mjs attest --address <url> --answer yes|no)` };
  if (a.answer !== 'yes') return { ok: false, kind: 'no', detail: `answered "${a.answer}" for ${attestationKey(address)} on ${a.at}: nothing is recorded` };
  return { ok: true, kind: 'attested', detail: `"yes" by ${a.by} on ${a.at}`, by: a.by, at: a.at };
}

export function setAttestation(workspace, address, answer, by) {
  if (!['yes', 'no'].includes(answer)) throw new Error('the answer must be yes or no');
  const config = readConfig(workspace);
  config.video ??= {};
  config.video.attestations ??= {};
  const entry = { answer, by: by || 'developer', at: new Date().toISOString(), question: ATTESTATION_QUESTION };
  config.video.attestations[attestationKey(address)] = entry;
  writeConfig(workspace, config);
  appendLog(workspace, { kind: 'attestation', address: attestationKey(address), ...entry });
  return entry;
}

/** The local generation log: attestations and runs, newest last (FR-003, FR-012). */
export function appendLog(workspace, entry) {
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, 'video-log.jsonl'), JSON.stringify(entry) + '\n', { flag: 'a' });
}
// [SCOPE 139 / T003] END

// [SCOPE 139 / T009] BEGIN — Preflight and the pinned HyperFrames install on first use (FR-009)
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32', ...opts });

/** Node 22+, FFmpeg and Playwright's Chromium. Each missing one is named with what to install. */
export function preflight({ root, nodeVersion = process.versions.node, ffmpegPath = null, which = run, chromium = undefined } = {}) {
  const missing = [];
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!(major >= 22)) missing.push(`Node.js 22 or newer (found ${nodeVersion}); install it from https://nodejs.org`);
  const ff = which(ffmpegPath ?? 'ffmpeg', ['-version']);
  if (ff.status !== 0) missing.push('FFmpeg on the PATH (or video.ffmpegPath); install it from https://ffmpeg.org/download.html');
  const c = chromium === undefined ? loadChromium(root) : chromium;
  if (!c) missing.push('Playwright in this project: npm i -D playwright && npx playwright install chromium');
  return { ok: missing.length === 0, missing };
}

export function loadChromium(root) {
  for (const base of [join(root, 'package.json'), import.meta.url]) {
    try {
      const req = createRequire(base);
      for (const name of ['playwright', '@playwright/test']) {
        try {
          return req(name).chromium;
        } catch {
          // try the next
        }
      }
    } catch {
      // try the next base
    }
  }
  return null;
}

/** The HyperFrames command at the pinned version (npx installs it on first use). */
export const hyperframes = (pin) => ['npx', ['--yes', `hyperframes@${pin}`]];

/** Install (first use) and confirm the pinned version; record the pin and the Apache 2.0 notice. */
export function ensureHyperframes(workspace, outDir, { pin = PINNED_HYPERFRAMES, exec = run } = {}) {
  const [cmd, base] = hyperframes(pin);
  const r = exec(cmd, [...base, '--version'], { env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
  if (r.status !== 0) return { ok: false, reason: `HyperFrames ${pin} could not be installed or run: ${String(r.stderr || r.stdout).split('\n')[0]}` };
  const config = readConfig(workspace);
  config.video ??= {};
  config.video.hyperframesVersion = pin;
  writeConfig(workspace, config);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'THIRD-PARTY-NOTICES.md'), `# Third-party notices\n\nThese videos were composed with HyperFrames ${pin} (https://github.com/heygen-com/hyperframes), licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Narration was synthesized locally with Kokoro-82M (Apache License 2.0).\n`);
  return { ok: true, version: pin };
}
// [SCOPE 139 / T009] END

// [SCOPE 139 / T004] BEGIN — Human-paced replay with click capture (FR-004)
export const DEFAULT_PACING = { hoverMs: 700, afterClickMs: 900, typeDelayMs: 90, screenHoldMs: 1500, stepGapMs: 500 };
export const pacingOf = (config) => ({ ...DEFAULT_PACING, ...(config.video?.pacing ?? {}) });

/** A screen's address moved onto the recording address (the walk may have run elsewhere). */
export function rebase(screenUrl, address) {
  try {
    const s = new URL(screenUrl);
    const a = new URL(address);
    return `${a.origin}${s.pathname}${s.search}`;
  } catch {
    return address;
  }
}

/** Find a step's element as a person would: its recorded selector, then by role and name, label, text. */
async function locate(page, element, label) {
  const tries = [];
  if (element?.selector) tries.push(page.locator(element.selector));
  const type = String(element?.type ?? '').toLowerCase();
  if (['button', 'link', 'tab', 'menuitem', 'checkbox'].includes(type)) tries.push(page.getByRole(type, { name: label, exact: false }));
  tries.push(page.getByLabel(label, { exact: false }), page.getByRole('button', { name: label }), page.getByRole('link', { name: label }), page.getByText(label, { exact: false }));
  for (const t of tries) {
    const first = t.first();
    if (await first.count().then((n) => n > 0).catch(() => false)) return first;
  }
  return null;
}

/**
 * Replay a lesson's steps at human speed. Each step lasts at least as long as its narration, so the
 * footage fits the voice. Returns { steps: [{ index, start, end, click }], problems } with times in
 * ms from the start of the recording and click positions in page pixels.
 */
export async function replay(page, { steps, screens, address, pacing, narrationMs = [], t0 = Date.now(), now = () => Date.now() }) {
  const out = [];
  const problems = [];
  const sleep = (ms) => page.waitForTimeout(Math.max(0, Math.round(ms)));
  let current = null;
  for (const [index, step] of steps.entries()) {
    const start = now() - t0;
    const screen = screens.get(step.screen);
    const element = screen?.elements?.find((e) => e.label === step.element || e.id === step.element) ?? null;
    const label = element?.label ?? step.element;
    if (screen?.url && current !== step.screen && (index === 0 || ['open', 'go'].includes(String(step.action ?? '').toLowerCase()))) {
      await page.goto(rebase(screen.url, address));
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(pacing.screenHoldMs);
    }
    current = step.screen;
    let click = null;
    const action = String(step.action ?? 'click').toLowerCase();
    if (!['open', 'go'].includes(action) || !screen?.url) {
      const target = await locate(page, element, label);
      if (!target) {
        problems.push(`step ${index + 1}: "${label}" was not found on ${screen?.title ?? step.screen}`);
      } else {
        await target.scrollIntoViewIfNeeded().catch(() => {});
        const box = await target.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
          await sleep(pacing.hoverMs);
          click = { t: now() - t0, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } };
        }
        if (['type', 'enter', 'fill'].includes(action)) {
          await target.click();
          await target.pressSequentially(String(step.example ?? 'Example'), { delay: pacing.typeDelayMs });
        } else if (['choose', 'select'].includes(action)) {
          await target.selectOption({ label: String(step.example ?? '') }).catch(async () => target.click());
        } else if (['check', 'toggle'].includes(action)) {
          await target.setChecked(step.example !== 'off');
        } else {
          await target.click();
        }
        await page.waitForLoadState('networkidle').catch(() => {});
        await sleep(pacing.afterClickMs);
      }
    }
    // Hold until the narration for this step has finished.
    const spent = now() - t0 - start;
    if (narrationMs[index] && spent < narrationMs[index]) await sleep(narrationMs[index] - spent);
    await sleep(pacing.stepGapMs);
    out.push({ index, start, end: now() - t0, click });
  }
  return { steps: out, problems, durationMs: now() - t0 };
}
// [SCOPE 139 / T004] END

// [SCOPE 139 / T005] BEGIN — The HyperFrames composition (FR-005)
export const INTRO_S = 3;
export const OUTRO_S = 4;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sec = (ms) => Math.round(ms) / 1000;

/** The narration for each step: the lesson's own words for that step. */
export function stepNarration(lessonStep, inventoryStep, element) {
  const label = element?.label ?? inventoryStep?.element ?? lessonStep.element;
  const action = String(inventoryStep?.action ?? lessonStep.action ?? 'click').toLowerCase();
  const verb = ['type', 'enter', 'fill'].includes(action) ? `In ${label}, type ${inventoryStep?.example ? inventoryStep.example : 'a value'}.`
    : ['choose', 'select'].includes(action) ? `In ${label}, choose ${inventoryStep?.example ?? 'an option'}.`
    : ['open', 'go'].includes(action) ? `Go to ${label}.`
    : `Click ${label}.`;
  return inventoryStep?.expect ? `${verb} ${inventoryStep.expect}` : verb;
}

/**
 * The composition (pure): footage after the intro, one narration clip and caption per step, the
 * cursor flown to every recorded click with a pulse, a highlight on the element in use, a chapter
 * marker per step, an end card naming the lesson, and the brand tokens. Optional mascot and a
 * customer presenter clip. Returns { html, durationS }.
 */
export function compositionHtml({ lesson, product, timeline, narrations, brand = {}, mascot = null, presenter = null }) {
  const intro = INTRO_S + (presenter ? presenter.durationS : 0);
  const footageS = sec(timeline.durationMs);
  const total = Math.ceil((intro + footageS + OUTRO_S) * 10) / 10;
  const accent = brand.accent ?? '#2563eb';
  const ink = brand.text ?? '#0f172a';
  const paper = brand.background ?? '#ffffff';
  const font = brand.font ?? 'Inter, Segoe UI, system-ui, sans-serif';
  const n = timeline.steps.length;
  const clips = [];
  const tweens = [];
  timeline.steps.forEach((s, i) => {
    const at = intro + sec(s.start);
    const dur = Math.max(0.5, sec(s.end - s.start));
    clips.push(`<div id="cap-${i}" class="clip caption" data-start="${at.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="3"><span class="chapter">Step ${i + 1} of ${n}</span><span class="text">${esc(narrations[i]?.text)}</span></div>`);
    if (narrations[i]?.file) clips.push(`<audio id="nar-${i}" src="${esc(narrations[i].file)}" data-start="${at.toFixed(2)}" data-duration="${Math.max(0.3, narrations[i].durationS).toFixed(2)}" data-track-index="${20 + i}" data-volume="1"></audio>`);
    if (s.click) {
      const ct = intro + sec(s.click.t);
      const b = s.click.box;
      clips.push(`<div id="hl-${i}" class="clip highlight" style="left:${b.x - 8}px;top:${b.y - 8}px;width:${b.w + 16}px;height:${b.h + 16}px" data-start="${Math.max(intro, ct - 0.6).toFixed(2)}" data-duration="0.85" data-track-index="4"></div>`);
      // The highlight ends just after the click: a click often changes the page, and a lingering
      // box would then frame whatever moved into that spot.
      tweens.push(`tl.to("#cursor", { x: ${s.click.x}, y: ${s.click.y}, duration: 0.55, ease: "power2.inOut" }, ${Math.max(intro, ct - 0.6).toFixed(2)});`);
      tweens.push(`tl.fromTo("#pulse", { x: ${s.click.x - 40}, y: ${s.click.y - 40}, scale: 0.3, opacity: 0.9 }, { scale: 1.4, opacity: 0, duration: 0.5, ease: "power1.out", immediateRender: false }, ${ct.toFixed(2)});`);
    }
  });
  const presenterClip = presenter
    ? `<video id="presenter" class="clip" src="${esc(presenter.file)}" data-start="${INTRO_S}" data-duration="${presenter.durationS}" data-track-index="1" muted playsinline></video>
      <audio id="presenter-audio" src="${esc(presenter.file)}" data-start="${INTRO_S}" data-duration="${presenter.durationS}" data-track-index="11" data-volume="1"></audio>`
    : '';
  const mascotImg = mascot ? `<img id="mascot-intro" class="clip mascot" src="${esc(mascot)}" data-start="0" data-duration="${INTRO_S}" data-track-index="6"><img id="mascot-outro" class="clip mascot" src="${esc(mascot)}" data-start="${(total - OUTRO_S).toFixed(2)}" data-duration="${OUTRO_S}" data-track-index="6">` : '';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>${esc(lesson.title)}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
body { margin: 0; background: ${paper}; font-family: ${font}; color: ${ink}; }
#root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
.fill { position: absolute; inset: 0; background: ${paper}; }
.card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.card h1 { margin: 0; font-size: 84px; color: ${ink}; }
.card p { margin: 24px 0 0; font-size: 36px; color: ${accent}; }
#footage { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; }
.caption { position: absolute; left: 160px; right: 160px; bottom: 64px; padding: 22px 32px; background: rgba(15, 23, 42, 0.86); color: #fff; border-radius: 16px; font-size: 38px; line-height: 1.3; }
.caption .chapter { display: block; font-size: 24px; color: ${accent}; filter: brightness(1.6); margin-bottom: 6px; }
.highlight { position: absolute; border: 6px solid ${accent}; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.18); }
#cursor { position: absolute; left: 0; top: 0; width: 64px; height: 64px; z-index: 50; }
#pulse { position: absolute; left: 0; top: 0; width: 80px; height: 80px; border-radius: 50%; border: 6px solid ${accent}; opacity: 0; z-index: 49; }
.mascot { position: absolute; right: 120px; bottom: 120px; width: 260px; height: 260px; object-fit: contain; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${total}">
  <div id="bg" class="fill"></div>
  <section id="intro" class="clip card" data-start="0" data-duration="${INTRO_S}" data-track-index="2"><h1>${esc(lesson.title)}</h1><p>${esc(product)} · how to</p></section>
  ${presenterClip}
  <video id="footage" class="clip" src="footage.webm" data-start="${intro}" data-duration="${footageS.toFixed(2)}" data-track-index="0" muted playsinline></video>
  ${clips.join('\n  ')}
  <section id="end" class="clip card" data-start="${(total - OUTRO_S).toFixed(2)}" data-duration="${OUTRO_S}" data-track-index="2"><h1>${esc(lesson.title)}</h1><p>Lesson ${esc(lesson.id)} · version ${esc(lesson.version)}</p></section>
  ${mascotImg}
  <div id="pulse"></div>
  <svg id="cursor" viewBox="0 0 32 32"><path d="M4 2 L4 26 L10 20 L14 30 L18 28 L14 18 L22 18 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.set("#cursor", { x: 960, y: 600, opacity: 0 }, 0);
tl.set("#cursor", { opacity: 1 }, ${intro});
${tweens.join('\n')}
tl.set("#cursor", { opacity: 0 }, ${(total - OUTRO_S).toFixed(2)});
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
  return { html, durationS: total };
}
// [SCOPE 139 / T005] END

// [SCOPE 139 / T006] BEGIN — Length guard (FR-006)
export const DEFAULT_LENGTH_TARGET_S = 180;

/** A video over the target is flagged for splitting; it is never sped up. */
export function lengthCheck(durationS, targetS = DEFAULT_LENGTH_TARGET_S) {
  return durationS > targetS
    ? { flagged: true, note: `runs ${Math.round(durationS)} s against a ${targetS} s target: split this process into shorter lessons (it was not sped up)` }
    : { flagged: false, note: null };
}
// [SCOPE 139 / T006] END

// [SCOPE 139 / T007] BEGIN — Presenter options and consent (FR-007)
/**
 * The presenter: narration only (default), an optional brand mascot image, and customer-supplied
 * clips accepted only with a recorded consent attestation. The generator never creates a likeness.
 */
export function presenterOptions(config, root) {
  const v = config.video ?? {};
  const problems = [];
  let presenter = null;
  if (v.presenterClip) {
    const c = v.presenterClip;
    const file = resolve(root, c.file ?? '');
    if (!c.file || !existsSync(file)) problems.push(`the presenter clip ${c.file ?? '(none)'} was not found`);
    else if (!c.consent?.attestedBy || !c.consent?.attestedAt || c.consent?.personConsented !== true) problems.push('the presenter clip has no consent attestation (video.presenterClip.consent: personConsented, attestedBy, attestedAt); it is not used');
    else presenter = { file, durationS: Number(c.durationS) || 6, consent: c.consent };
  }
  const mascot = v.mascot ? resolve(root, v.mascot) : null;
  if (mascot && !existsSync(mascot)) problems.push(`the mascot image ${v.mascot} was not found`);
  return { presenter, mascot: mascot && existsSync(mascot) ? mascot : null, voice: v.voice ?? 'am_adam', problems };
}
// [SCOPE 139 / T007] END

// [SCOPE 139 / T008] BEGIN — Staleness and --video --stale (FR-008)
export function readVideos(outDir) {
  try {
    return JSON.parse(readFileSync(join(outDir, VIDEOS_MANIFEST), 'utf8'));
  } catch {
    return { videos: {} };
  }
}

/**
 * The videos to re-record: a lesson that SCOPE-137 flagged stale (its screens changed), or whose
 * lesson version moved past the video's (--teach --stale regenerated it), or that has no video yet.
 */
export function staleVideos({ lessons, videos, flagged = [] }) {
  const flaggedIds = new Set(flagged.map((f) => f.lesson ?? f));
  const out = [];
  for (const [id, l] of Object.entries(lessons)) {
    const v = videos[id];
    if (!v) out.push({ id, reason: 'no video yet' });
    else if (flaggedIds.has(id)) out.push({ id, reason: 'a change reached its screens (Change Impact)' });
    else if (Number(v.lessonVersion) !== Number(l.version)) out.push({ id, reason: `its lesson moved from version ${v.lessonVersion} to ${l.version}` });
  }
  return out;
}
// [SCOPE 139 / T008] END

// [SCOPE 139 / T012] BEGIN — Delivery and the generation log (FR-012)
/** Customer videos are build output: docs/onboarding-videos/ stays out of git. */
export function ensureVideosIgnored(root) {
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const want = [];
  if (!lines.some((l) => ['docs/onboarding-videos/', '/docs/onboarding-videos/'].includes(l))) want.push('/docs/onboarding-videos/');
  // The saved recording session holds sign-in cookies: never in git.
  if (!lines.some((l) => l.endsWith('.video-session.json'))) want.push('**/.video-session.json');
  if (!want.length) return false;
  writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}# Onboarding videos (SCOPE-139): build output you host, and the recording session\n${want.join('\n')}\n`);
  return true;
}

async function loadAgreementLib(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const lib = join(dir, '_wxAI', 'impact', 'lib', 'agreement.mjs');
    if (existsSync(lib)) return import(pathToFileURL(lib).href);
    if (dirname(dir) === dir) return null;
  }
}

/** One onboarding_video_generated record per run: who, when, environment, attestation, pin, videos. */
export function videoEvent({ projectId, actor, appVersion, environment, attestation, pin, videos, refused = null }) {
  return {
    projectId,
    type: 'onboarding_video_generated',
    source: 'cli',
    actor,
    rawContent: refused ? `${actor} was refused recording onboarding videos: ${refused}` : `${actor} generated ${videos.length} onboarding video(s) for app version ${appVersion}`,
    metadata: {
      appVersion: String(appVersion),
      environment,
      attestation,
      hyperframesVersion: pin,
      videos: videos.slice(0, 500).map((v) => ({ lessonId: v.lessonId, lessonVersion: v.lessonVersion, durationS: v.durationS, flaggedForSplit: v.flaggedForSplit })),
      refused,
      occurredAt: new Date().toISOString(),
    },
  };
}

export async function logRun({ root, actor, send = null, ...rest }) {
  const lib = await loadAgreementLib(root) ?? await loadAgreementLib(dirname(fileURLToPath(import.meta.url)));
  if (!lib) return { sent: false, skipped: 'the kit agreement library was not found' };
  const projectId = lib.projectIdFor(root);
  if (!projectId) return { sent: false, skipped: 'no wxKanban project id configured' };
  return lib.recordAgreement(root, videoEvent({ projectId, actor, ...rest }), send ?? lib.mcpSender(lib.mcpConnection(root)));
}
// [SCOPE 139 / T012] END

// [SCOPE 139 / T010] BEGIN — Local narration and rendering, at no per-video cost (FR-010)
function durationS(file, ffprobe = 'ffprobe') {
  const r = run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(String(r.stdout).trim()) || 0;
}

/** Kokoro narration through HyperFrames' local TTS. No paid service, no network beyond the install. */
/** Text safe to pass through a shell on every platform: the words stay, shell syntax goes. */
export const speakable = (text) => String(text).replace(/["`$\\]/g, "'").replace(/[%^&|<>]/g, ' ').replace(/\s+/g, ' ').trim();

export function narrate(text, file, { pin = PINNED_HYPERFRAMES, voice = 'am_adam', exec = run } = {}) {
  const [cmd, base] = hyperframes(pin);
  const r = exec(cmd, [...base, 'tts', `"${speakable(text)}"`, '-o', file, '--voice', voice], { env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
  if (r.status !== 0 || !existsSync(file)) throw new Error(`narration failed: ${String(r.stderr || r.stdout).split('\n')[0]}`);
  return durationS(file);
}

/** Render one composition locally. Cloud rendering is the customer's own opt-in (video.renderCommand). */
export function render(dir, output, { pin = PINNED_HYPERFRAMES, exec = run, renderCommand = null } = {}) {
  const [cmd, base] = renderCommand ? [renderCommand[0], renderCommand.slice(1)] : hyperframes(pin);
  const args = renderCommand ? base : [...base, 'render', '--quality', 'high', '--output', output];
  const r = exec(cmd, args, { cwd: dir, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
  if (r.status !== 0 || !existsSync(output)) throw new Error(`rendering failed: ${String(r.stderr || r.stdout).split('\n').slice(-3).join(' ')}`);
  return durationS(output);
}
// [SCOPE 139 / T010] END

// [SCOPE 139 / T001] BEGIN — record: one video per Teaching Skill (FR-001)
function appVersionOf(root, explicit) {
  if (explicit) return explicit;
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Record the selected lessons. The guards run first and in this order: web app, UAT address,
 * attestation (or the demo seed), preflight, the pinned install. Any failure records nothing.
 */
export async function recordVideos({ root, workspace, lessonsDir, outDir, address, stale = false, only = null, appVersion = null, actor = 'developer', deps = {} }) {
  const config = readConfig(workspace);
  const result = { refused: null, videos: [], problems: [], notes: [] };
  const web = webOnlyCheck(deps.appTypes !== undefined ? deps.appTypes : appTypes(root));
  if (!web.ok) return { ...result, refused: web.reason };
  if (web.note) result.notes.push(web.note);
  const addr = address ?? config.video?.address ?? null;
  const guard = recordingGuard(addr, config.environments);
  if (!guard.ok) {
    await (deps.log ?? logRun)({ root, actor, appVersion: appVersionOf(root, appVersion), environment: guard.classification ?? 'unknown', attestation: 'none', pin: PINNED_HYPERFRAMES, videos: [], refused: guard.reason });
    return { ...result, refused: guard.reason };
  }
  const att = attestationStatus(config, addr);
  if (!att.ok) return { ...result, refused: `Recording refused: demo-data attestation ${att.detail}` };
  const pre = (deps.preflight ?? preflight)({ root, ffmpegPath: config.video?.ffmpegPath ?? null });
  if (!pre.ok) return { ...result, refused: `Preflight stopped before recording. Install: ${pre.missing.join('; ')}` };
  const pin = config.video?.hyperframesVersion ?? PINNED_HYPERFRAMES;
  const hf = (deps.ensureHyperframes ?? ensureHyperframes)(workspace, outDir, { pin });
  if (!hf.ok) return { ...result, refused: hf.reason };
  ensureVideosIgnored(root);

  if (att.kind === 'seeded') {
    const c = config.video.demoSeed.command;
    const r = run(c[0], c.slice(1), { cwd: root });
    if (r.status !== 0) return { ...result, refused: `the demo company seed failed (exit ${r.status}); nothing was recorded` };
  }

  const manifest = readManifest(lessonsDir);
  const videos = readVideos(outDir);
  let ids = Object.keys(manifest.lessons ?? {});
  if (stale) ids = staleVideos({ lessons: manifest.lessons ?? {}, videos: videos.videos, flagged: readStale(root).flagged }).map((s) => s.id);
  if (only) ids = ids.filter((id) => id === only);
  if (!ids.length) return { ...result, notes: [...result.notes, stale ? 'no video is stale' : 'no lessons found: run /wxHelpGenerate --teach first'] };

  const inventory = JSON.parse(readFileSync(join(workspace, 'inventory.json'), 'utf8'));
  const screens = new Map((inventory.screens ?? []).map((s) => [s.id, s]));
  const processes = new Map((inventory.processes ?? []).map((p) => [String(p.id ?? p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), p]));
  const pacing = pacingOf(config);
  const people = presenterOptions(config, root);
  result.problems.push(...people.problems);
  const chromium = deps.chromium ?? loadChromium(root);
  const storageState = config.video?.storageState ? resolve(root, config.video.storageState) : null;
  const product = config.product_name ?? config.product ?? basename(root);
  const brand = { accent: config.theme?.accent ?? config.theme?.primary, text: config.theme?.text, background: config.theme?.background, font: config.theme?.font };

  for (const id of ids) {
    const lesson = manifest.lessons[id];
    const proc = processes.get(id);
    if (!proc) {
      result.problems.push(`${id}: its process is no longer in inventory.json; regenerate the lessons first`);
      continue;
    }
    const work = join(outDir, '.work', id);
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    // Narration first: each step's footage is held to fit its voice.
    const narrations = proc.steps.map((s, i) => {
      const screen = screens.get(s.screen);
      const element = screen?.elements?.find((e) => e.label === s.element || e.id === s.element);
      const text = stepNarration(lesson.steps?.[i] ?? s, s, element);
      const file = `nar-${i}.wav`;
      const d = (deps.narrate ?? narrate)(text, join(work, file), { pin, voice: people.voice });
      return { text, file, durationS: d };
    });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: work, size: { width: 1920, height: 1080 } }, ...(storageState && existsSync(storageState) ? { storageState } : {}) });
    const page = await context.newPage();
    const t0 = Date.now();
    const timeline = await replay(page, { steps: proc.steps, screens, address: addr, pacing, narrationMs: narrations.map((n) => n.durationS * 1000), t0 });
    const raw = await page.video().path();
    await context.close();
    await browser.close();
    const footage = join(work, 'footage.webm');
    if (raw !== footage) writeFileSync(footage, readFileSync(raw));
    if (raw !== footage) rmSync(raw, { force: true });
    if (timeline.problems.length) result.problems.push(...timeline.problems.map((p) => `${id}: ${p}`));
    const comp = compositionHtml({ lesson: { id, title: proc.title, version: lesson.version }, product, timeline, narrations, brand, mascot: people.mascot ? relativeAsset(work, people.mascot) : null, presenter: people.presenter ? { ...people.presenter, file: relativeAsset(work, people.presenter.file) } : null });
    writeFileSync(join(work, 'index.html'), comp.html);
    writeFileSync(join(work, 'timeline.json'), JSON.stringify(timeline, null, 2));
    const length = lengthCheck(comp.durationS, config.video?.lengthTargetS ?? DEFAULT_LENGTH_TARGET_S);
    if (length.flagged) result.problems.push(`${id}: ${length.note}`);
    const mp4 = join(outDir, `${id}.mp4`);
    const rendered = (deps.render ?? render)(work, mp4, { pin, renderCommand: config.video?.renderCommand ?? null });
    const entry = {
      lessonId: id, lessonVersion: lesson.version, appVersion: appVersionOf(root, appVersion), file: `${id}.mp4`,
      environment: { classification: 'uat', address: attestationKey(addr) }, attestation: att.kind === 'seeded' ? 'seeded demo company' : `yes (${att.by}, ${att.at})`,
      hyperframesVersion: pin, durationS: Math.round(rendered || comp.durationS), flaggedForSplit: length.flagged, screens: lesson.screens ?? [],
      clicks: timeline.steps.filter((s) => s.click).length, steps: timeline.steps.length, recordedAt: new Date().toISOString(),
      presenter: people.presenter ? { consent: people.presenter.consent } : null,
    };
    videos.videos[id] = entry;
    result.videos.push(entry);
    // The raw footage and narration are working files; keep them only when asked (video.keepWork).
    if (!config.video?.keepWork) rmSync(work, { recursive: true, force: true });
  }
  if (!config.video?.keepWork) rmSync(join(outDir, '.work'), { recursive: true, force: true });
  writeFileSync(join(outDir, VIDEOS_MANIFEST), JSON.stringify(videos, null, 2) + '\n');
  appendLog(workspace, { kind: 'run', at: new Date().toISOString(), by: actor, address: attestationKey(addr), videos: result.videos.map((v) => v.lessonId) });
  await (deps.log ?? logRun)({ root, actor, appVersion: appVersionOf(root, appVersion), environment: 'uat', attestation: att.kind === 'seeded' ? 'seeded' : 'attested-yes', pin, videos: result.videos });
  return result;
}

function relativeAsset(workDir, file) {
  const name = basename(file);
  writeFileSync(join(workDir, name), readFileSync(file));
  return name;
}
// [SCOPE 139 / T001] END

// [SCOPE 139 / T001] BEGIN — CLI: check, attest, login, record, stale
async function main(argv) {
  const [cmd] = argv;
  const arg = (n, d = null) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const root = process.cwd();
  const workspace = resolve(arg('workspace', 'docs-workspace'));
  const lessonsDir = resolve(arg('lessons', join('docs', 'teaching-skills')));
  const outDir = resolve(arg('out', DEFAULT_OUT));
  const config = readConfig(workspace);
  const address = arg('address') ?? config.video?.address ?? null;
  if (cmd === 'check') {
    const web = webOnlyCheck(appTypes(root));
    const guard = recordingGuard(address, config.environments);
    const att = guard.ok ? attestationStatus(config, address) : null;
    const pre = preflight({ root, ffmpegPath: config.video?.ffmpegPath ?? null });
    console.log([
      `Web app: ${web.ok ? 'yes' : 'no'}${web.note ? ` (${web.note})` : ''}${web.ok ? '' : ` — ${web.reason}`}`,
      `Address: ${guard.ok ? `${attestationKey(address)} is UAT` : guard.reason}`,
      att ? `Demo data: ${att.ok ? att.detail : att.detail}` : null,
      `Preflight: ${pre.ok ? 'Node, FFmpeg and Playwright found' : pre.missing.join('; ')}`,
      `HyperFrames: pinned ${config.video?.hyperframesVersion ?? PINNED_HYPERFRAMES} (installs on first use)`,
    ].filter(Boolean).join('\n'));
    return web.ok && guard.ok && att?.ok && pre.ok ? 0 : 2;
  }
  if (cmd === 'attest') {
    const guard = recordingGuard(address, config.environments);
    if (!guard.ok) {
      console.error(guard.reason);
      return 2;
    }
    const e = setAttestation(workspace, address, arg('answer'), arg('by'));
    console.log(`Recorded for ${attestationKey(address)}: ${ATTESTATION_QUESTION} ${e.answer} (${e.by}, ${e.at})`);
    return 0;
  }
  if (cmd === 'login') {
    const guard = recordingGuard(address, config.environments);
    if (!guard.ok) {
      console.error(guard.reason);
      return 2;
    }
    const chromium = loadChromium(root);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(address);
    console.log('Sign in in the browser window as a demo user, then close the window.');
    await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
    const state = join(workspace, '.video-session.json');
    await context.storageState({ path: state }).catch(() => {});
    await browser.close().catch(() => {});
    const c = readConfig(workspace);
    c.video ??= {};
    c.video.storageState = state;
    writeConfig(workspace, c);
    console.log(`Session saved for recording (${state}); it is gitignored with docs-workspace/.video-session.json.`);
    return 0;
  }
  if (cmd === 'stale') {
    const list = staleVideos({ lessons: readManifest(lessonsDir).lessons ?? {}, videos: readVideos(outDir).videos, flagged: readStale(root).flagged });
    console.log(list.length ? list.map((s) => `${s.id}: ${s.reason}`).join('\n') : 'No video is stale.');
    return 0;
  }
  if (cmd === 'record') {
    const r = await recordVideos({ root, workspace, lessonsDir, outDir, address, stale: argv.includes('--stale'), only: arg('only'), appVersion: arg('app-version'), actor: arg('by', process.env.USER ?? process.env.USERNAME ?? 'developer') });
    if (r.refused) {
      console.error(r.refused);
      return 2;
    }
    for (const n of r.notes) console.log(n);
    for (const v of r.videos) console.log(`${v.file}: lesson ${v.lessonId} v${v.lessonVersion}, ${v.durationS} s, ${v.clicks} click(s)${v.flaggedForSplit ? ' — FLAGGED for splitting' : ''}`);
    for (const p of r.problems) console.log(`Problem: ${p}`);
    return r.problems.length ? 1 : 0;
  }
  console.log('Usage: node video.mjs check | attest --address <url> --answer yes|no | login --address <url> | record [--stale] [--only <lesson>] | stale');
  return cmd ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((c) => process.exit(c ?? 0), (e) => {
    console.error(`video: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
// [SCOPE 139 / T001] END
