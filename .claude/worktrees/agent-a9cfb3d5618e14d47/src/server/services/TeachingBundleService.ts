/**
 * "Learn wxKanban with your AI" — the teaching bundle. SCOPE-138 / T011 (FR-010).
 *
 * wxKanban's own lessons are generated each release by `/wxHelpGenerate --teach` and committed as
 * markdown under docs/teaching-skills/, with the generator's manifest (.lessons.json). The zip is a
 * build output and is not committed, so it is assembled here from exactly the lessons the manifest
 * lists, plus start-here.md. Nothing else in that folder (the manifest itself included) is served.
 * Every lesson passed the generator's pre-write data check before it was written.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// [SCOPE 138 / T011] BEGIN — Teaching bundle: manifest summary and on-request zip (FR-010)
export interface TeachingBundleInfo {
  available: boolean;
  product: string | null;
  appVersion: string | null;
  generatedAt: string | null;
  lessons: Array<{ id: string; title: string; version: number }>;
}

interface Manifest {
  product?: string;
  appVersion?: string;
  generatedAt?: string;
  lessons?: Record<string, { title?: string; version?: number }>;
}

const LESSON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function teachingDir(): string {
  return process.env.TEACHING_SKILLS_DIR ?? join(process.cwd(), "docs", "teaching-skills");
}

function readManifest(dir: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, ".lessons.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** The lessons the manifest lists that are really on disk, with a safe id. Nothing else qualifies. */
function listedLessons(dir: string, manifest: Manifest): Array<{ id: string; title: string; version: number }> {
  return Object.entries(manifest.lessons ?? {})
    .filter(([id]) => LESSON_ID.test(id) && existsSync(join(dir, `${id}.md`)))
    .map(([id, l]) => ({ id, title: String(l.title ?? id), version: Number(l.version ?? 1) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function bundleInfo(dir = teachingDir()): TeachingBundleInfo {
  const manifest = readManifest(dir);
  if (!manifest || !existsSync(join(dir, "start-here.md"))) {
    return { available: false, product: null, appVersion: null, generatedAt: null, lessons: [] };
  }
  const lessons = listedLessons(dir, manifest);
  return {
    available: lessons.length > 0,
    product: manifest.product ?? null,
    appVersion: manifest.appVersion ?? null,
    generatedAt: manifest.generatedAt ?? null,
    lessons,
  };
}

// A stored (uncompressed) zip — the same format the kit generator writes, so any unzip reads it.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/** start-here.md plus every listed lesson — or null when no bundle has been generated yet. */
export function buildBundle(dir = teachingDir()): { fileName: string; data: Buffer } | null {
  const info = bundleInfo(dir);
  if (!info.available) return null;
  const entries = [{ name: "start-here.md", data: readFileSync(join(dir, "start-here.md")) }];
  for (const l of info.lessons) entries.push({ name: `${l.id}.md`, data: readFileSync(join(dir, `${l.id}.md`)) });
  const version = (info.appVersion ?? "current").replace(/[^0-9A-Za-z.-]/g, "");
  return { fileName: `wxkanban-teaching-skills-${version}.zip`, data: zipStore(entries) };
}
// [SCOPE 138 / T011] END
