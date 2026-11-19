// Build an `implement --input` envelope from real files on disk, so nothing has to be escaped
// by hand. Memory records that hand-built envelopes lose backslashes; JSON.stringify does not.
//
//   npx tsx scripts/mk-implement-input.mts <out.json> <srcPath>:<repoPath>:<action> [...]
//
// e.g. npx tsx scripts/mk-implement-input.mts .impl.json /tmp/x.ts:src/shared/x.ts:create
import { readFileSync, writeFileSync } from "node:fs";

const [out, ...specs] = process.argv.slice(2);
if (!out || specs.length === 0) {
  console.error("usage: mk-implement-input.mts <out.json> <src>:<repoPath>:<action> [...]");
  process.exit(1);
}

const files = specs.map((s) => {
  // split from the right so Windows drive letters in <src> survive
  const lastColon = s.lastIndexOf(":");
  const action = s.slice(lastColon + 1);
  const rest = s.slice(0, lastColon);
  const midColon = rest.lastIndexOf(":");
  const repoPath = rest.slice(midColon + 1);
  const src = rest.slice(0, midColon);
  const body = action === "delete" ? "" : readFileSync(src, "utf-8");
  return { path: repoPath, body, action };
});

writeFileSync(out, JSON.stringify({ files }, null, 2), "utf-8");
for (const f of files) {
  console.log(`${f.action.padEnd(6)} ${f.path}  (${f.body.length} chars)`);
}
console.log("envelope: " + out);
