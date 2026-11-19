// Turn raw 2x screenshots into documentation-ready finals via annotate.py.
// Redactions + callout markers use measured device-pixel coordinates.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// WS = output workspace (WXK_WS for per-language builds); default = docs-workspace.
const WS = process.env.WXK_WS ? path.resolve(process.env.WXK_WS) : path.resolve(__dirname, "..");
const ANNOTATE = path.resolve(__dirname, "..", "..", ".claude", "skills", "wxHelpGenerate", "scripts", "annotate.py");
const SPECDIR = path.join(WS, "_annotate-specs");
fs.mkdirSync(SPECDIR, { recursive: true });
const PY = process.env.PY || "python";

// job: { screen, src, out, scale?, crop?, redact?, markers? }
const RED = "#e11d48";
const jobs = [
  { screen: "login", src: "login-overview", out: "login-overview",
    crop: [956, 280, 1924, 1580], scale: 0.62,
    markers: [ {x:1440,y:685,n:1}, {x:1440,y:849,n:2}, {x:1440,y:963,n:3}, {x:1588,y:1150,n:4,color:RED} ] },

  { screen: "dashboard", src: "dashboard-overview", out: "dashboard-overview", scale: 0.5,
    markers: [ {x:255,y:290,n:1}, {x:670,y:694,n:2,color:RED}, {x:2715,y:694,n:3} ] },

  { screen: "projects", src: "projects-overview", out: "projects-overview", scale: 0.5 },
  { screen: "project-detail", src: "project-detail-overview", out: "project-detail-overview", scale: 0.5 },
  { screen: "tasks", src: "tasks-overview", out: "tasks-overview", scale: 0.5 },
  // [SCOPE 111] Two testing surfaces, captured separately — see screens.mjs.
  { screen: "testing-qa", src: "testing-qa-overview", out: "testing-qa-overview", scale: 0.5 },
  { screen: "testing-user", src: "testing-user-overview", out: "testing-user-overview", scale: 0.5 },

  { screen: "team", src: "team-overview", out: "team-overview", scale: 0.5,
    redact: [ [562,513,1075,634] ] },

  { screen: "integrations", src: "integrations-overview", out: "integrations-overview", scale: 0.5 },
  { screen: "work-hub", src: "work-hub-overview", out: "work-hub-overview", scale: 0.5 },
  { screen: "invoices", src: "invoices-overview", out: "invoices-overview", scale: 0.5 },
  { screen: "reports", src: "reports-overview", out: "reports-overview", scale: 0.5 },
  { screen: "stack-profiles", src: "stack-profiles-overview", out: "stack-profiles-overview", scale: 0.5 },
  { screen: "theme-profiles", src: "theme-profiles-overview", out: "theme-profiles-overview", scale: 0.5 },
  { screen: "faq", src: "faq-overview", out: "faq-overview", scale: 0.5 },
  { screen: "help", src: "help-overview", out: "help-overview", scale: 0.5 },

  { screen: "settings", src: "settings-overview", out: "settings-overview", scale: 0.5,
    redact: [ [1018,802,2374,918] ] },
];

let ok = 0, fail = 0;
for (const j of jobs) {
  const inp = path.join(WS, "screens", j.screen, "raw", `${j.src}.png`);
  const out = path.join(WS, "screens", j.screen, "img", `${j.out}.png`);
  if (!fs.existsSync(inp)) { console.log(`MISSING src: ${inp}`); fail++; continue; }
  const spec = {};
  if (j.crop) spec.crop = j.crop;
  if (j.scale) spec.scale = j.scale;
  if (j.redact) spec.redact = j.redact;
  if (j.markers) spec.markers = j.markers;
  const specPath = path.join(SPECDIR, `spec-${j.screen}-${j.out}.json`);
  fs.writeFileSync(specPath, JSON.stringify(spec));
  try {
    const res = execFileSync(PY, [ANNOTATE, "--in", inp, "--out", out, "--spec", specPath], { encoding: "utf8" });
    console.log(res.trim());
    ok++;
  } catch (e) {
    console.log(`FAIL ${j.screen}: ${e.message}`);
    fail++;
  }
}
console.log(`\ndone: ${ok} ok, ${fail} fail`);
