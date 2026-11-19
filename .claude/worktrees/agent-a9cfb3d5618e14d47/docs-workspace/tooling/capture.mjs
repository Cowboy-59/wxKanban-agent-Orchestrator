import { launch, login, settle, inventory, shot, shotFull, pageText, applyLocale, WORKSPACE } from "./driver.mjs";
import { SCREENS } from "./screens.mjs";
import fs from "fs";
import path from "path";

const BASE = process.env.WXK_BASE || "http://localhost:5173";
const { browser, page } = await launch();
const results = [];
try {
  await login(page);
  console.log("logged in\n");

  for (const s of SCREENS) {
    process.stdout.write(`-> ${s.id}  (${s.path})  `);
    try {
      if (s.id === "login") {
        // Capture the login screen in a fresh incognito context (logged out).
        const ctx = await browser.createBrowserContext();
        const p2 = await ctx.newPage();
        await p2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
        await applyLocale(p2);
        await p2.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2", timeout: 60000 });
        await settle(p2, 800);
        await shot(p2, s.id, `${s.id}-overview`);
        await shotFull(p2, s.id, `${s.id}-full`);
        const inv = await inventory(p2);
        const txt = await pageText(p2);
        results.push({ ...s, elements: inv, text: txt });
        fs.writeFileSync(path.join(WORKSPACE, "screens", s.id, "text.txt"), txt);
        await ctx.close();
        console.log(`ok (${inv.length} els)`);
        continue;
      }
      await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2", timeout: 60000 });
      await settle(page, 1400);
      await shot(page, s.id, `${s.id}-overview`);
      await shotFull(page, s.id, `${s.id}-full`);
      const inv = await inventory(page);
      const txt = await pageText(page);
      const url = page.url();
      results.push({ ...s, finalUrl: url, elements: inv, text: txt });
      fs.writeFileSync(path.join(WORKSPACE, "screens", s.id, "text.txt"), txt);
      console.log(`ok (${inv.length} els)  url=${url.replace(BASE, "")}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      results.push({ ...s, error: e.message });
    }
  }

  fs.writeFileSync(
    path.join(WORKSPACE, "inventory.raw.json"),
    JSON.stringify({ screens: results }, null, 2)
  );
  console.log("\nwrote inventory.raw.json");
} catch (e) {
  console.error("FATAL:", e.message);
} finally {
  await browser.close();
}
