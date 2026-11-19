/**
 * SCOPE-058 / T033 — ScopeKanbanCard shows the checkout holder (FR-011, Amendment C).
 *
 * Feedback 6290202f: scope cards on the web Kanban board showed no person, so a
 * team could not see who had which window checked out. Renders the card to static
 * markup (no DOM needed) inside the router + dnd contexts it requires.
 */
// [SCOPE 058 / T033] BEGIN — Guard: the web scope card shows the checkout holder (FR-011)
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { ScopeKanbanCard } from "../../src/client/components/Projects/ScopeKanbanCard";
import type { ProjectScope } from "../../src/shared/types/projects";

function makeScope(overrides: Partial<ProjectScope> = {}): ProjectScope {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    projectid: "019a0000-0000-7000-8000-000000000002",
    specnumber: "W0002",
    title: "win_AmiViewer",
    content: "",
    status: "implementing",
    specorder: 1,
    isoptional: false,
    createdbyid: null,
    createdat: "2026-10-01T00:00:00.000Z",
    approvedat: null,
    updatedat: "2026-10-01T00:00:00.000Z",
    createdbyname: null,
    claimedbyid: null,
    claimedbyname: null,
    claimedat: null,
    taskcount: 3,
    completedtaskcount: 1,
    opencount: 2,
    inprogresscount: 0,
    orphanedcount: 0,
    documents: [],
    ...overrides,
  };
}

function render(scope: ProjectScope): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        DndContext,
        null,
        createElement(ScopeKanbanCard, { scope, canDrag: false, onOpenChat: () => {} }),
      ),
    ),
  );
}

describe("ScopeKanbanCard checkout holder (SPEC-058 FR-011)", () => {
  it("shows the holder's name on a claimed scope", () => {
    const html = render(
      makeScope({
        claimedbyid: "f75de04a-fbc1-4e14-b8ca-7ac665527c42",
        claimedbyname: "Alessandro",
        claimedat: "2026-10-08T09:40:26.865Z",
      }),
    );
    expect(html).toContain('data-testid="scope-card-holder"');
    expect(html).toContain(">Alessandro</span>");
    expect(html).toContain("Checked out by Alessandro on ");
  });

  it("shows no holder line on a free scope", () => {
    const html = render(makeScope());
    expect(html).not.toContain("scope-card-holder");
    expect(html).not.toContain("Checked out by");
  });

  it("still marks a claimed scope whose holder has no profile name", () => {
    const html = render(makeScope({ claimedbyid: "f75de04a-fbc1-4e14-b8ca-7ac665527c42" }));
    expect(html).toContain(">Unknown user</span>");
  });
});
// [SCOPE 058 / T033] END
