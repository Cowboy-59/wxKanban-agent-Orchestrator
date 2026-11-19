/**
 * SCOPE-098 / T006 — client-facing strings for the delete-scope control.
 *
 * No DOM test runner is available in this repo (jsdom / @testing-library/react
 * are not installed), so the React interaction (confirm → DELETE → refetch) is
 * covered by the manual smoke in specs/098-delete-scope/tests.md. This test
 * guards the part that is cheap to regress and expensive to notice: the three
 * new projectPanel keys must exist in every authored locale, and the confirm
 * string must interpolate the impact params (scope number, title, task count,
 * document count) so FR-003's "state the impact" requirement can't silently
 * degrade to raw i18n keys.
 */
import { describe, it, expect } from "vitest";
import { enUS } from "../../src/client/i18n/locales/en-US";
import { frFR } from "../../src/client/i18n/locales/fr-FR";
import { ptBR } from "../../src/client/i18n/locales/pt-BR";
import { itIT } from "../../src/client/i18n/locales/it-IT";
import { deDE } from "../../src/client/i18n/locales/de-DE";
import { esES } from "../../src/client/i18n/locales/es-ES";

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ["en-US", enUS as unknown as Record<string, unknown>],
  ["fr-FR", frFR as unknown as Record<string, unknown>],
  ["pt-BR", ptBR as unknown as Record<string, unknown>],
  ["it-IT", itIT as unknown as Record<string, unknown>],
  ["de-DE", deDE as unknown as Record<string, unknown>],
  ["es-ES", esES as unknown as Record<string, unknown>],
];

function projectPanel(bundle: Record<string, unknown>): Record<string, string> {
  return (bundle.projectPanel ?? {}) as Record<string, string>;
}

describe("SCOPE-098 delete-scope i18n keys", () => {
  it.each(LOCALES)("%s defines the three delete-scope keys", (_name, bundle) => {
    const pp = projectPanel(bundle);
    expect(typeof pp.deleteScope).toBe("string");
    expect(pp.deleteScope.length).toBeGreaterThan(0);
    expect(typeof pp.deleteScopeConfirm).toBe("string");
    expect(typeof pp.deleteScopeError).toBe("string");
  });

  it.each(LOCALES)("%s confirm interpolates num/title/tasks/docs", (_name, bundle) => {
    const confirm = projectPanel(bundle).deleteScopeConfirm;
    for (const token of ["{{num}}", "{{title}}", "{{tasks}}", "{{docs}}"]) {
      expect(confirm).toContain(token);
    }
  });

  it("en-US confirm reads as a destructive, irreversible warning", () => {
    const confirm = projectPanel(enUS as unknown as Record<string, unknown>).deleteScopeConfirm.toLowerCase();
    expect(confirm).toContain("delete");
    expect(confirm).toMatch(/cannot be undone|permanently/);
  });
});
