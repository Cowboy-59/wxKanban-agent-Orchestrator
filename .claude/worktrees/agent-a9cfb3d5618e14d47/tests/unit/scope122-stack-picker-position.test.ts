/**
 * SCOPE-122 / T008 (Amendment A, FR-009) — stack dimension picker panel geometry.
 *
 * Field feedback 826dd172: the "Choose" dropdown on the Hosting / Deploy row was sliced
 * off at the bottom of the New Project modal. Root cause was containment, not geometry —
 * the panel was absolutely positioned with its containing block inside the modal body's
 * `max-h-[70vh] overflow-y-auto` box, so that scroller clipped it. The fix portals the
 * panel to document.body and positions it fixed, which is what removes the clip.
 *
 * No DOM test runner is available in this repo (vitest runs `environment: "node"`; jsdom
 * and @testing-library/react are not installed), following the same constraint recorded in
 * scope098-delete-scope-i18n.test.ts. The containment change is therefore covered by the
 * manual check in specs/122-spec-status-vocabulary/tasks.md T008. What IS guarded here is
 * the part that is cheap to regress and expensive to notice: the flip/clamp maths that
 * decides where the now-unclipped panel lands.
 */
import { describe, it, expect } from "vitest";
import { computePanelPosition } from "../../src/client/components/Projects/StackEditor";

// Mirrors the constants in StackEditor.tsx.
const PANEL_WIDTH = 256;
const PANEL_MAX_HEIGHT = 240;
const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;
const PANEL_MIN_HEIGHT = 96;

const TRIGGER_HEIGHT = 30;

describe("SCOPE-122 T008 — stack picker panel position", () => {
  /**
   * A trigger whose top edge sits `top` px down the viewport. Declared inside the
   * describe block so it is not a top-level declaration — `auditfences` requires those
   * to carry a fence, and fences are the orchestrator's to write, not hand-authored.
   */
  const triggerAt = (top: number, right = 700) => ({
    top,
    bottom: top + TRIGGER_HEIGHT,
    right,
  });

  describe("default placement", () => {
    it("opens below the trigger at full height when there is room", () => {
      const trigger = triggerAt(100);
      const pos = computePanelPosition(trigger, { width: 1280, height: 1024 });

      expect(pos.top).toBe(trigger.bottom + PANEL_GAP);
      expect(pos.maxHeight).toBe(PANEL_MAX_HEIGHT);
    });

    it("right-aligns to the trigger, preserving the old `right-0` behaviour", () => {
      const trigger = triggerAt(100, 700);
      const pos = computePanelPosition(trigger, { width: 1280, height: 1024 });

      expect(pos.left).toBe(trigger.right - PANEL_WIDTH);
    });
  });

  describe("the reported defect — Hosting / Deploy, the last of six dimensions", () => {
    it("flips above the trigger rather than running off the bottom", () => {
      // 768px viewport, trigger low in a 70vh modal body: this is the repro.
      const trigger = triggerAt(660);
      const pos = computePanelPosition(trigger, { width: 1280, height: 768 });

      // Above the trigger, and clear of it.
      expect(pos.top).toBeLessThan(trigger.top);
      expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(trigger.top);
      // Fully on screen — the whole point of the fix.
      expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(768 - VIEWPORT_MARGIN);
    });

    it("does not flip while there is still room below", () => {
      // Guards against over-eager flipping: a panel near the vertical middle that flipped
      // on a few pixels of scroll would be its own bug.
      const trigger = triggerAt(300);
      const pos = computePanelPosition(trigger, { width: 1280, height: 768 });

      expect(pos.top).toBe(trigger.bottom + PANEL_GAP);
    });
  });

  describe("structural guarantee — the panel is never off-screen", () => {
    it("stays within the viewport for every trigger position at 768px", () => {
      const viewport = { width: 1280, height: 768 };

      for (let top = 0; top <= viewport.height; top += 1) {
        const pos = computePanelPosition(triggerAt(top), viewport);

        expect(pos.top).toBeGreaterThanOrEqual(0);
        expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(viewport.height);
        expect(pos.maxHeight).toBeGreaterThanOrEqual(PANEL_MIN_HEIGHT);
        expect(pos.maxHeight).toBeLessThanOrEqual(PANEL_MAX_HEIGHT);
      }
    });

    it("stays within the viewport across a range of viewport heights", () => {
      // 600 is a short laptop; 1440 is a tall desktop. All six dimensions of a stack sit
      // somewhere in this band, so the invariant has to hold across it.
      for (const height of [600, 700, 768, 900, 1080, 1440]) {
        const viewport = { width: 1280, height };

        for (let top = 0; top <= height; top += 7) {
          const pos = computePanelPosition(triggerAt(top), viewport);

          expect(pos.top).toBeGreaterThanOrEqual(0);
          expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(height);
        }
      }
    });

    it("never positions the panel outside the viewport horizontally", () => {
      const viewport = { width: 1280, height: 768 };

      // Trigger hard against the left edge (panel would want a negative left) and hard
      // against the right edge (panel would want to overflow past the right).
      for (const right of [0, 10, 100, 640, 1270, 1280, 1400]) {
        const pos = computePanelPosition(triggerAt(100, right), viewport);

        expect(pos.left).toBeGreaterThanOrEqual(0);
        expect(pos.left + PANEL_WIDTH).toBeLessThanOrEqual(viewport.width);
      }
    });

    it("degrades to a scrollable panel rather than an off-screen one in a tiny viewport", () => {
      // Viewport shorter than the panel's own floor: it must still start on-screen.
      const pos = computePanelPosition(triggerAt(20), { width: 1280, height: 120 });

      expect(pos.top).toBeGreaterThanOrEqual(0);
      expect(pos.maxHeight).toBe(PANEL_MIN_HEIGHT);
    });
  });
});
