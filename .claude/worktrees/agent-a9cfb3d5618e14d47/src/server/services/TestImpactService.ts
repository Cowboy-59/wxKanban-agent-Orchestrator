import { db } from "~/db/client.js";
import { testplanitems } from "~/db/schema/testplanitems.js";
import { testitemsubjects } from "~/db/schema/testitemsubjects.js";
import { testretests } from "~/db/schema/testretests.js";
import { testcycles } from "~/db/schema/testcycles.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { normalizeSourcePath } from "./TestPlanService.js";
import { TestCycleService } from "./TestCycleService.js";
import { ScopeStageService } from "./ScopeStageService.js"; // [SCOPE 123 / T021]
import type {
  ImpactGraphPayload,
  ImpactResult,
  TestRetestReason,
  EdgelessChangeKind,
} from "~/shared/types/tests.js";

const logger = createLogger("test-impact-service");

export class ImpactRequestError extends Error {}

/**
 * A retest mark that does not exist, or belongs to another company. Distinct
 * from ImpactRequestError so the route can answer 404 rather than 400 — a
 * cross-tenant id must be indistinguishable from a missing one.
 */
export class RetestNotFoundError extends Error {}

/**
 * Above this share of the human set, a change is reported as broad so the team
 * sees an explanation rather than an inexplicable wall of re-tests. The marks
 * still stand — this is never a suppression (FR-049b4).
 */
export const BROAD_CHANGE_RATIO = 0.5;

/**
 * FR-049b3 — recognise an edgeless change from its PATH alone.
 *
 * This is a safety net, not the primary mechanism: the runner is supposed to
 * classify these explicitly, because it holds the code. But a runner that
 * forgets to classify one would otherwise hand us a changed file that the
 * transitive walk reaches nothing from, and the change would read as affecting
 * no tests — the exact silent under-mark this requirement exists to stop.
 *
 * Pattern-matching a string the runner already sent is not reading the
 * repository (FR-049b1a); no file is opened here.
 */
export function classifyEdgelessPath(path: string): EdgelessChangeKind | null {
  const p = path.toLowerCase();
  if (/(^|\/)src\/db\/migrations\/.*\.sql$/.test(p) || /(^|\/)migrations\/.*\.sql$/.test(p)) {
    return "migration";
  }
  if (/(^|\/)\.env(\.|$)/.test(p)) return "env";
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p)) return "dependency";
  if (/(^|\/)package\.json$/.test(p)) return "dependency";
  if (
    /\.(json|ya?ml|toml|ini|conf)$/.test(p) &&
    !/\/(locales?|i18n)\//.test(p) // translation payloads are content, handled below
  ) {
    return "config";
  }
  if (/\.(css|scss|svg|png|jpe?g|webp|ico|woff2?|md|html)$/.test(p)) return "static";
  if (/\/(locales?|i18n)\//.test(p)) return "static";
  return null;
}

/**
 * Which edgeless kinds cannot be narrowed to particular tests.
 *
 * A config, env or dependency change has no boundary the application can reason
 * about — a changed connection string, feature flag, or transitive dependency
 * can alter behaviour anywhere. The scope's own asymmetry decides this: an
 * over-mark costs a tester one dismissal with a reason, an under-mark ships a
 * defect under a signoff that says it was verified. So these mark everything.
 *
 * `static` is NOT in this set: content and styling can only change the rendered
 * surface, so it narrows to items whose subjects are client code.
 */
const UNSCOPABLE_EDGELESS = new Set<EdgelessChangeKind>(["config", "env", "dependency"]);

/**
 * Does a declared subject cover this table?
 *
 * Two ways a subject can name a table, and both are in live use:
 *   - `unitid` is the inventory id `drizzle-table:<table>` — the precise form;
 *   - `sourcepath` is the schema module, `src/db/schema/<table>.ts`, which is how
 *     a generated subject usually arrives. Matched case-insensitively because
 *     the file is `testPlan.ts` while the table is `testplans`, and allowing for
 *     the singular/plural mismatch that convention produces.
 */
export function subjectCoversTable(
  subject: { unitid: string | null; sourcepath: string },
  table: string,
): boolean {
  const t = table.toLowerCase();
  if (subject.unitid && subject.unitid.toLowerCase() === `drizzle-table:${t}`) return true;

  const file = subject.sourcepath.toLowerCase();
  if (!file.includes("/schema/")) return false;
  const base = file.split("/").pop()?.replace(/\.[cm]?tsx?$/, "") ?? "";
  if (!base) return false;
  // testPlan.ts ↔ testplans, timeentry.ts ↔ timeentries, users.ts ↔ users.
  const singular = t.replace(/ies$/, "y").replace(/s$/, "");
  return base === t || base === singular;
}

// [SCOPE 111 / T015] BEGIN — Change-impact analysis: selective withdrawal of human signoffs
// [SCOPE 123 / T021] MODIFIED-BY — dismissRetest re-assesses the item's scope stage
export class TestImpactService {
  /**
   * Apply Retest marks for a cycle from the runner-supplied graph.
   *
   * The two errors here are NOT symmetric, and the whole design leans on that:
   * an under-mark ships a defect under a green human signoff and has no
   * recovery; an over-mark costs the tester one dismissal with a reason. So
   * every ambiguity resolves toward marking.
   *
   * Refusals, in order, before anything is written:
   *   1. no graph at all — silence must never read as "nothing was affected";
   *   2. a commit that does not match the cycle under test — a graph computed
   *      against different code marks the wrong items, undetectably.
   */
  static async analyze(
    cycleid: string,
    payload: ImpactGraphPayload | null | undefined,
    opts: { apply?: boolean } = {},
  ): Promise<ImpactResult> {
    const apply = opts.apply ?? true;

    if (!payload) {
      throw new ImpactRequestError(
        "Impact request carries no graph. Refusing — an absent graph is not evidence that nothing was affected.",
      );
    }
    // An edgeless-only release is legitimate and must not be refused here: a
    // push containing nothing but a migration has no dependents to send and is
    // not broad, yet it is precisely the case FR-049b3 exists for.
    if (!payload.broad && !payload.dependents && !payload.edgeless?.length) {
      throw new ImpactRequestError(
        "Impact request declares neither a dependent set, a broad analysis, nor any edgeless change. Refusing rather than assuming no impact.",
      );
    }

    const [cycle] = await db.select().from(testcycles).where(eq(testcycles.id, cycleid)).limit(1);
    if (!cycle) throw new ImpactRequestError(`Test cycle ${cycleid} not found`);

    // FR-050 — marks may not be applied to a closed cycle. Checked before the
    // commit is pinned below, so a stale graph cannot stamp a closed cycle.
    if (apply) await TestCycleService.assertWritable(cycleid, "machine");

    if (!payload.commitsha) {
      throw new ImpactRequestError("Impact graph carries no commit. Refusing.");
    }
    if (cycle.commitsha && cycle.commitsha !== payload.commitsha) {
      throw new ImpactRequestError(
        `Impact graph was computed against ${payload.commitsha} but the cycle under test is ${cycle.commitsha}. Refusing.`,
      );
    }
    if (!cycle.commitsha) {
      // First graph for this cycle pins it, so a later mismatched one is caught.
      await db
        .update(testcycles)
        .set({ commitsha: payload.commitsha, updatedat: new Date() })
        .where(eq(testcycles.id, cycleid));
    }

    // Only human items can be marked — machine signoffs never carry across a
    // cycle, so there is nothing to withdraw.
    const items = await db
      .select({
        id: testplanitems.id,
        itemkey: testplanitems.itemkey,
      })
      .from(testplanitems)
      .where(
        and(eq(testplanitems.projectid, cycle.projectid), eq(testplanitems.executor, "human")),
      );

    if (items.length === 0) {
      return { cycleid, applied: apply, broad: Boolean(payload.broad), markedCount: 0, survivedCount: 0, marks: [] };
    }

    const itemIds = items.map((i) => i.id);
    const subjects = await db
      .select()
      .from(testitemsubjects)
      .where(inArray(testitemsubjects.itemid, itemIds));

    const subjectsByItem = new Map<string, typeof subjects>();
    for (const subject of subjects) {
      const list = subjectsByItem.get(subject.itemid) ?? [];
      list.push(subject);
      subjectsByItem.set(subject.itemid, list);
    }

    const marks: ImpactResult["marks"] = [];

    // ---- FR-049b3: changes with no import edges -----------------------------
    // Resolved BEFORE the reachability walk, because some of these force every
    // human item to be marked and the walk then has nothing left to decide.
    const declaredEdgeless = new Map(
      (payload.edgeless ?? []).map((e) => [normalizeSourcePath(e.path), e]),
    );

    // A changed file that LOOKS edgeless but was not classified is unresolvable,
    // not harmless. Failing safe here is what makes forgetting to classify one
    // cost a dismissal rather than a shipped defect.
    const unclassified = payload.changedFiles
      .map(normalizeSourcePath)
      .filter((f) => !declaredEdgeless.has(f) && classifyEdgelessPath(f) !== null);

    // Migration tables are the one edgeless kind that maps precisely.
    const changedTables: Array<{ table: string; path: string; note: string | null }> = [];
    let globalEdgeless: { path: string; why: string } | null = null;

    for (const [path, entry] of declaredEdgeless) {
      if (UNSCOPABLE_EDGELESS.has(entry.kind)) {
        globalEdgeless ??= {
          path,
          why: `${entry.kind} change (${path}) has no boundary the application can narrow — every human test is marked`,
        };
        continue;
      }
      if (entry.kind === "migration") {
        if (!entry.tables?.length) {
          // A migration whose altered tables could not be determined is the
          // highest-consequence unknown in this scope: it reaches every screen
          // reading the changed shape, through code that never names the file.
          globalEdgeless ??= {
            path,
            why: `migration ${path} did not declare the tables it alters — marking every human test rather than guessing`,
          };
          continue;
        }
        for (const table of entry.tables) {
          changedTables.push({ table, path, note: entry.note ?? null });
        }
      }
      // `static` narrows to client subjects in the per-item walk below.
    }

    if (!globalEdgeless && unclassified.length) {
      globalEdgeless = {
        path: unclassified[0],
        why: `changed file(s) with no import edges were not classified by the runner (${unclassified.slice(0, 3).join(", ")}${unclassified.length > 3 ? ", …" : ""}) — treated as unresolvable`,
      };
    }

    const staticEdgeless = [...declaredEdgeless.entries()].filter(
      ([, e]) => e.kind === "static",
    );

    if (payload.broad || globalEdgeless) {
      // Two distinct causes land here, and the mark records which:
      //   - the runner could not send a complete dependent set and said so
      //     rather than truncating; or
      //   - an edgeless change (FR-049b3) has no boundary to narrow to.
      // Either way every human item is marked — the application never converts
      // "too big to send" or "nothing imports it" into "nothing was affected".
      for (const item of items) {
        marks.push({
          itemid: item.id,
          itemkey: item.itemkey,
          reason: "broad",
          triggerpath: globalEdgeless?.path ?? payload.changedFiles[0] ?? null,
          reachedSubjectPath: null,
          pathlength: null,
        });
      }
    } else {
      // Build the reached set once: every changed file, plus everything the
      // runner says transitively depends on one (FR-049b — Option B).
      const reached = new Map<string, { changedFile: string; path: string[] }>();
      for (const file of payload.changedFiles) {
        const key = normalizeSourcePath(file);
        reached.set(key, { changedFile: key, path: [key] });
      }
      for (const dep of payload.dependents ?? []) {
        const key = normalizeSourcePath(dep.dependentPath);
        if (!reached.has(key)) {
          reached.set(key, {
            changedFile: normalizeSourcePath(dep.changedFile),
            path: dep.path?.map(normalizeSourcePath) ?? [key],
          });
        }
      }

      for (const item of items) {
        const declared = subjectsByItem.get(item.id) ?? [];

        // FR-049e — an item that cannot say what code it covers cannot be
        // shown to be unaffected. Fails safe to a mark.
        if (declared.length === 0) {
          marks.push({
            itemid: item.id,
            itemkey: item.itemkey,
            reason: "undetermined",
            triggerpath: null,
            reachedSubjectPath: null,
            pathlength: null,
          });
          continue;
        }

        // FR-049b1d — walk from EVERY declared subject; any hit marks the item.
        let hit: { subject: (typeof declared)[number]; entry: { changedFile: string; path: string[] } } | null = null;
        for (const subject of declared) {
          const entry = reached.get(subject.sourcepath);
          if (entry) {
            hit = { subject, entry };
            break;
          }
        }

        if (hit) {
          marks.push({
            itemid: item.id,
            itemkey: item.itemkey,
            reason: "impact",
            triggerpath: hit.entry.changedFile,
            reachedSubjectPath: hit.subject.sourcepath,
            pathlength: Math.max(hit.entry.path.length - 1, 0),
          });
          continue;
        }

        // FR-049b3 — a MIGRATION reaches an item through the tables it alters,
        // not through an import. Nothing in the codebase imports a .sql file, so
        // without this the highest-consequence change in the system marks
        // nothing. pathlength 0: the migration alters the very object the item's
        // subject covers, which is as direct as impact gets.
        const tableHit = changedTables
          .map((ct) => ({
            ct,
            subject: declared.find((sub) => subjectCoversTable(sub, ct.table)),
          }))
          .find((x) => x.subject);

        if (tableHit?.subject) {
          marks.push({
            itemid: item.id,
            itemkey: item.itemkey,
            reason: "impact",
            triggerpath: tableHit.ct.path,
            reachedSubjectPath: tableHit.subject.sourcepath,
            pathlength: 0,
          });
          continue;
        }

        // FR-049b3 — STATIC content and styling can only alter the rendered
        // surface, so it narrows to items whose subjects are client code rather
        // than marking the whole suite.
        if (staticEdgeless.length) {
          const clientSubject = declared.find((sub) =>
            sub.sourcepath.toLowerCase().startsWith("src/client/"),
          );
          if (clientSubject) {
            marks.push({
              itemid: item.id,
              itemkey: item.itemkey,
              reason: "impact",
              triggerpath: staticEdgeless[0][0],
              reachedSubjectPath: clientSubject.sourcepath,
              pathlength: 0,
            });
            continue;
          }
        }
      }
    }

    const broad = Boolean(payload.broad) || marks.length / items.length >= BROAD_CHANGE_RATIO;

    if (apply) {
      for (const mark of marks) {
        const subject = subjects.find(
          (s) => s.itemid === mark.itemid && s.sourcepath === mark.reachedSubjectPath,
        );
        await this.upsertMark(cycleid, mark, subject?.id ?? null);
      }
      logger.info(
        { cycleid, marked: marks.length, of: items.length, broad },
        "Impact analysis applied",
      );
    }

    return {
      cycleid,
      applied: apply,
      broad,
      markedCount: marks.length,
      survivedCount: items.length - marks.length,
      marks,
    };
  }

  /** One mark per item per cycle — reaching an item by five paths is still one
   * request to re-test it. */
  private static async upsertMark(
    cycleid: string,
    mark: ImpactResult["marks"][number],
    reachedsubjectid: string | null,
  ): Promise<void> {
    const [existing] = await db
      .select({ id: testretests.id })
      .from(testretests)
      .where(and(eq(testretests.cycleid, cycleid), eq(testretests.itemid, mark.itemid)))
      .limit(1);

    if (existing) return;

    await db.insert(testretests).values({
      cycleid,
      itemid: mark.itemid,
      reason: mark.reason as TestRetestReason,
      triggerpath: mark.triggerpath,
      reachedsubjectid,
      chain: mark.pathlength !== null ? `${mark.triggerpath} → ${mark.reachedSubjectPath}` : null,
      pathlength: mark.pathlength,
    });
  }

  /**
   * FR-049f — the tester judges the change could not affect what they verified.
   * Their ORIGINAL signoff stands; this does not create a new one, and renders
   * as dismissed rather than as a fresh pass.
   */
  static async dismiss(
    retestid: string,
    userid: string,
    reason: string,
    companyid: string | null,
  ): Promise<void> {
    if (!reason?.trim()) {
      throw new ImpactRequestError("A dismissal requires a stated reason");
    }

    // Tenancy is enforced HERE rather than at the route, because the route is
    // given only a retest id and the owning project is three joins away
    // (testretests → testcycles → companyprojects). Every other route in this
    // file guards with `guardProject`; this one could not, and previously did
    // not guard at all — the update ran on `WHERE id = retestid` alone, so any
    // authenticated caller could dismiss any other company's Retest mark.
    //
    // That is not a generic IDOR: dismissing a mark withdraws a re-test
    // requirement and lets an already-standing human signoff answer the gate.
    // It is the one write in this scope that can make an unverified release look
    // verified, which is precisely what the scope exists to prevent.
    if (!companyid) {
      throw new RetestNotFoundError("Retest mark not found");
    }
    const [owner] = await db
      .select({ companyid: companyprojects.companyid, cycleid: testretests.cycleid })
      .from(testretests)
      .innerJoin(testcycles, eq(testretests.cycleid, testcycles.id))
      .innerJoin(companyprojects, eq(testcycles.projectid, companyprojects.id))
      .where(eq(testretests.id, retestid))
      .limit(1);

    // Mirrors `guardProject`: a mark in another company is reported as missing
    // rather than forbidden, so the response cannot be used to enumerate ids.
    if (!owner || owner.companyid !== companyid) {
      throw new RetestNotFoundError("Retest mark not found");
    }

    // FR-050 — ordered after the tenancy check so a cross-tenant caller learns
    // nothing about the cycle's state.
    await TestCycleService.assertWritable(owner.cycleid, "human");

    const [updated] = await db
      .update(testretests)
      .set({
        resolution: "dismissed",
        resolvedat: new Date(),
        dismissedbyid: userid,
        dismissreason: reason.trim(),
        updatedat: new Date(),
      })
      .where(eq(testretests.id, retestid))
      .returning();

    // [SCOPE 111 / T026] A dismissal releases a gate without anyone re-running
    // the test, so it is audited like the waiver it resembles (FR-049g). A
    // release cleared largely by dismissals has had less verification than its
    // green state suggests, and this is the record that makes that visible.
    //
    // Unconditional. This was previously wrapped in `if (companyid)`, which made
    // the AUDIT skippable while the MUTATION was not — exactly backwards for a
    // record whose purpose is to make quiet gate-clearing visible. A caller
    // without a company context is now refused above, so by this line the audit
    // can always be written.
    await db.insert(companyauditlogs).values({
      companyid,
      action: "testretest.dismissed",
      changedby: userid,
      newvalue: {
        retestid,
        itemid: updated?.itemid ?? null,
        cycleid: updated?.cycleid ?? null,
        reason: reason.trim(),
      },
      description: `Retest mark dismissed on item ${updated?.itemid ?? retestid}: ${reason.trim()}`,
    });

    // SCOPE-123: a dismissal can clear the last gate holding the item's scope.
    if (updated?.itemid) {
      await ScopeStageService.onTestItemsWritten([updated.itemid], { actor: userid, trigger: "retest_dismissed" });
    }

    logger.info({ retestid, userid, companyid }, "Retest mark dismissed by tester");
  }

  /** Called when a fresh human signoff answers the mark. */
  static async resolveBySignoff(cycleid: string, itemid: string): Promise<void> {
    await db
      .update(testretests)
      .set({ resolution: "signoff", resolvedat: new Date(), updatedat: new Date() })
      .where(and(eq(testretests.cycleid, cycleid), eq(testretests.itemid, itemid)));
  }

  static async listForCycle(cycleid: string) {
    return db.select().from(testretests).where(eq(testretests.cycleid, cycleid));
  }
}
// [SCOPE 111 / T015] END
