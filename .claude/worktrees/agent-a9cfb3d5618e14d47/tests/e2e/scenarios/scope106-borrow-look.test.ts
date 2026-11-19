/**
 * E2E Scenario (SCOPE-106 / T017): Borrow-a-Look → Business Template.
 *
 * Full flow: extract a look from a website → brand it with the customer's own
 * header/footer → save as a named company template → apply it to another project,
 * inheriting BOTH tokens and chrome. Plus the fail-open guarantee (FR-003).
 *
 * Convention note: like the sibling scenario-*.test.ts files, this documents the
 * end-to-end contract against the real endpoints. It runs against a live, seeded,
 * authenticated stack (BASE + an ADMIN session cookie/token); in CI it is driven with
 * seeded fixtures. The auth-gate + routing invariants it depends on are already proven
 * runnably in tests/contract/scope106-theme-templates.test.ts.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const authHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  ...(process.env.E2E_ADMIN_TOKEN ? { Authorization: `Bearer ${process.env.E2E_ADMIN_TOKEN}` } : {}),
};
const run = process.env.E2E_ADMIN_TOKEN ? describe : describe.skip;

run("SCOPE-106 borrow-look end-to-end", () => {
  const projectA = process.env.E2E_PROJECT_A ?? "";
  const projectB = process.env.E2E_PROJECT_B ?? "";

  it("US1 — borrows a look from a URL (complete, source=url)", async () => {
    const res = await fetch(`${BASE}/api/themes/derive/url`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ appType: "web", url: "https://stripe.com" }),
    });
    expect(res.status).toBe(200);
    const { theme } = (await res.json()) as { theme: { source: string; light: object; dark: object } };
    expect(theme.source).toBe("url");
    expect(theme.light).toBeTruthy();
    expect(theme.dark).toBeTruthy();
  });

  it("US4 — fail-open: an unreachable/hostile URL returns a safe theme, not a 5xx", async () => {
    const res = await fetch(`${BASE}/api/themes/derive/url`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ appType: "web", url: "http://169.254.169.254/latest/meta-data/" }),
    });
    expect(res.status).toBe(200); // never 5xx
    const body = (await res.json()) as { theme: { source: string }; note?: string };
    expect(body.theme.source).toBe("url");
    expect(body.note).toBeTruthy(); // "couldn't fully read that site …" (SSRF-blocked)
  });

  it("US2+US3 — brand, save as template, then apply to another project inheriting chrome", async () => {
    const theme = { source: "url", sourceRef: "https://stripe.com" };
    const chrome = { logoRef: null, appName: "Acme Inc.", footerLine: "© 2026 Acme Inc." };

    // Save current look + chrome on project A (persists chrome per-project).
    const put = await fetch(`${BASE}/api/projects/${projectA}/theme`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ appType: "web", theme, chrome }),
    });
    expect(put.status).toBe(200);

    // Save as a named company template.
    const saved = await fetch(`${BASE}/api/themes/templates`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: `Acme House Style ${Date.now()}`, theme, chrome }),
    });
    expect(saved.status).toBe(201);
    const { template } = (await saved.json()) as { template: { id: string } };

    // Apply it to project B — inherits BOTH tokens and chrome.
    const applied = await fetch(`${BASE}/api/projects/${projectB}/theme/apply-template`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ appType: "web", templateId: template.id }),
    });
    expect(applied.status).toBe(200);

    const loaded = await fetch(`${BASE}/api/projects/${projectB}/theme?appType=web`, {
      headers: authHeaders,
    });
    const data = (await loaded.json()) as { chrome?: { appName: string } | null };
    expect(data.chrome?.appName).toBe("Acme Inc.");
  });
});
