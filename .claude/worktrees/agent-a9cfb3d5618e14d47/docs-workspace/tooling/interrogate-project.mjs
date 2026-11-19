import { launch, login, settle, shot, pageText, WORKSPACE } from "./driver.mjs";
import { PROJECT_ID } from "./screens.mjs";
import fs from "fs";
import path from "path";

const BASE = process.env.WXK_BASE || "http://localhost:5173";
const { browser, page } = await launch();
const notes = {};

async function gotoProject() {
  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: "networkidle2", timeout: 60000 });
  await settle(page, 1400);
}

// Exact-text click, restricted to the main content (never the sidebar nav/aside).
async function clickTab(txt) {
  const handle = await page.evaluateHandle((t) => {
    const inSidebar = (e) => e.closest("nav, aside");
    const els = [...document.querySelectorAll("button, a, [role='tab'], [role='button']")];
    return els.find((e) => !inSidebar(e) && (e.innerText || "").trim() === t) || null;
  }, txt);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

try {
  await login(page);

  // View tabs (change how scopes are shown) and doc tabs (change what report is shown).
  // Re-navigate before each so a click that routes away doesn't poison the next.
  const tabs = [
    ["view-matrix", "Matrix"],
    ["view-bugs", "Bug Reports"],
    ["tab-lifecycle", "Lifecycle"],
    ["tab-devplan", "Development Plan"],
    ["tab-portfolio", "Portfolio Analyzer"],
    ["tab-compliance", "Compliance"],
    ["tab-learnings", "Learnings"],
    ["tab-kit", "Kit"],
  ];

  for (const [id, label] of tabs) {
    await gotoProject();
    const ok = await clickTab(label);
    if (!ok) { notes[id] = { label, found: false }; console.log(`skip ${label} (not found)`); continue; }
    await settle(page, 1700);
    await shot(page, "project-detail", `pd-${id}`);
    const url = page.url();
    const txt = (await pageText(page)).replace(/\s+/g, " ").slice(0, 1100);
    notes[id] = { label, found: true, url, text: txt };
    console.log(`\n=== ${label}  [${url.replace(BASE, "")}] ===\n${txt.slice(0, 600)}`);
  }

  fs.writeFileSync(path.join(WORKSPACE, "tooling", "project-tabs.json"), JSON.stringify(notes, null, 2));
  console.log("\nwrote project-tabs.json");
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await browser.close();
}
