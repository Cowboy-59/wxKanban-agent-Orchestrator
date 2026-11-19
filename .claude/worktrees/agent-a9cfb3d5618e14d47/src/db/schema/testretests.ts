import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { testcycles } from "./testcycles";
import { testplanitems } from "./testplanitems";
import { testitemsubjects } from "./testitemsubjects";
import { userprofiles } from "./userprofiles";

// [SCOPE 111 / T008] BEGIN — Retest marks: selective withdrawal of a human signoff
// FR-049a, FR-049c, FR-049f, FR-049g, FR-049b1e.
//
// A human signoff is never wiped by a version bump. It is withdrawn only where
// the change actually reaches the code that item covers, and a row here is that
// withdrawal. The gate reads "does this item have a standing signoff with no
// unanswered mark against it", so the withdrawal is a query result rather than
// a mutation of the signoff — nothing to half-complete, and the original
// signoff survives a dismissal intact.
//
// The reason columns exist because a tester asked to repeat work deserves to
// know what changed. `triggerpath` plus `reachedsubjectid` answer "which part
// of my five-screen flow moved", and `pathlength` shows how far away the change
// was — the difference between a direct edit and a distant shared utility, which
// is exactly the judgement a dismissal rests on.
export const testretests = pgTable(
  "testretests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    cycleid: uuid("cycleid")
      .notNull()
      .references(() => testcycles.id, { onDelete: "cascade" }),
    itemid: uuid("itemid")
      .notNull()
      .references(() => testplanitems.id, { onDelete: "cascade" }),

    // 'impact' — the graph reached this item.
    // 'undetermined' — impact could NOT be established (no fence, unresolvable
    //   subject). Fails safe to a mark rather than leaving a signoff standing.
    // 'broad' — the runner declared the analysis broad, so every human item is
    //   marked (FR-049b1c2).
    reason: varchar("reason", { length: 20 }).notNull(),

    // What changed, and how it reaches this item.
    triggerpath: varchar("triggerpath", { length: 500 }),
    triggerfence: varchar("triggerfence", { length: 100 }),
    triggerunit: varchar("triggerunit", { length: 500 }),
    // FR-049b1e — WHICH declared subject the change reached.
    reachedsubjectid: uuid("reachedsubjectid").references(
      () => testitemsubjects.id,
      { onDelete: "set null" },
    ),
    // Representative path from the change to the subject, and its length.
    chain: text("chain"),
    pathlength: integer("pathlength"),

    appliedat: timestamp("appliedat").defaultNow().notNull(),

    // How the mark was answered. Unanswered marks are what block the gate.
    // 'signoff' — a fresh human signoff was given.
    // 'dismissed' — the tester judged the change could not affect what they
    //   verified; their ORIGINAL signoff stands and is not replaced (FR-049f).
    resolution: varchar("resolution", { length: 20 }),
    resolvedat: timestamp("resolvedat"),
    dismissedbyid: uuid("dismissedbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    dismissreason: text("dismissreason"),

    createdat: timestamp("createdat").defaultNow().notNull(),
    // Marks mutate when answered — resolution, resolvedat, dismissedbyid.
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    // One mark per item per cycle — a change reaching an item by five paths is
    // still one request to re-test it.
    cycleItemUnique: uniqueIndex("idx_testretests_cycle_item").on(
      table.cycleid,
      table.itemid,
    ),
    // The gate's lookup: unanswered marks in the current cycle.
    cycleResolutionIdx: index("idx_testretests_cycle_resolution").on(
      table.cycleid,
      table.resolution,
    ),
    itemIdx: index("idx_testretests_item").on(table.itemid),
    // FK covering indexes — see the note in testplanitems.
    reachedsubjectIdx: index("idx_testretests_reachedsubject").on(
      table.reachedsubjectid,
    ),
    dismissedbyIdx: index("idx_testretests_dismissedby").on(table.dismissedbyid),
  }),
);
// [SCOPE 111 / T008] END

/** True when this mark is still outstanding and therefore still blocking. */
export type TestRetest = typeof testretests.$inferSelect;
export type NewTestRetest = typeof testretests.$inferInsert;

// Convenience — a mark counts against the gate until it carries a resolution.
export const RETEST_UNANSWERED = null;

export const RETEST_REASONS = ["impact", "undetermined", "broad"] as const;
export const RETEST_RESOLUTIONS = ["signoff", "dismissed"] as const;
