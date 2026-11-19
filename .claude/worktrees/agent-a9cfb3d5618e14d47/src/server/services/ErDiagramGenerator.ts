import { pool, db } from '~/db/client.js';
import { eq } from 'drizzle-orm';
import { wxkanbandocuments } from '~/db/schema/wxkanbandocuments.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('er-diagram-generator');

// Stable identity of the single global ER-diagram document in wxkanbandocuments.
const ERD_DOCUMENTTYPE = 'erdiagram';
const ERD_TITLE = 'Database Entity-Relationship Diagram';

// Domain grouping: ordered rules, first substring match wins, else "Other".
// Keeps any single Mermaid erDiagram to a readable size (FR-010).
const DOMAIN_RULES: Array<[string, string[]]> = [
  ['Compliance & Audit', ['audit', 'compliance', 'duty']],
  ['Consulting & Engagements', ['engagement', 'subassign']],
  ['Marketing & Feedback', ['campaign', 'marketing', 'feedback']],
  ['Kit / MCP / Fencing', ['mcp', 'fence', 'gitcommand', 'projectkit']],
  ['Lifecycle & Specs', ['spec', 'phase', 'scope', 'proposal', 'document', 'lifecycle']],
  ['Time & Billing', ['timeentr', 'invoice', 'billing', 'subscription']],
  ['Projects & Tasks', ['task', 'project', 'note', 'pmsystem', 'sync']],
  ['Tenancy & Users', ['compan', 'user', 'session', 'invitation', 'token', 'notification', 'setting', 'help']],
];
const OTHER_DOMAIN = 'Other';

interface ColumnInfo { table: string; column: string; type: string; ispk: boolean; }
interface FkInfo { src: string; tgt: string; srccol: string; }
interface IntrospectionResult { tables: string[]; columns: ColumnInfo[]; fks: FkInfo[]; }

// [SCOPE 021 / T011] BEGIN — Database ER Diagram generator (introspect + group + Mermaid + store)
export class ErDiagramGenerator {
  /** Read live schema structure from information_schema. Read-only. */
  static async introspect(): Promise<IntrospectionResult> {
    const tablesQ = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE' order by table_name`,
    );
    const tables = tablesQ.rows.map((r: { table_name: string }) => r.table_name);

    const colsQ = await pool.query<ColumnInfo & { table_name: string; column_name: string; data_type: string }>(
      `select c.table_name, c.column_name, c.data_type,
              coalesce(pk.ispk,false) as ispk
       from information_schema.columns c
       left join (
         select kcu.table_name, kcu.column_name, true as ispk
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
         where tc.constraint_type='PRIMARY KEY' and tc.table_schema='public'
       ) pk on pk.table_name=c.table_name and pk.column_name=c.column_name
       where c.table_schema='public'
       order by c.table_name, c.ordinal_position`,
    );
    const columns: ColumnInfo[] = colsQ.rows.map(
      (r: { table_name: string; column_name: string; data_type: string; ispk: boolean }) => ({
        table: r.table_name, column: r.column_name, type: r.data_type, ispk: r.ispk,
      }),
    );

    const fksQ = await pool.query<FkInfo>(
      `select tc.table_name as src, ccu.table_name as tgt, kcu.column_name as srccol
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
       where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'`,
    );

    return { tables, columns, fks: fksQ.rows };
  }

  /** Assign a table to a domain group (first matching rule wins). */
  static domainOf(table: string): string {
    const t = table.toLowerCase();
    for (const [group, needles] of DOMAIN_RULES) {
      if (needles.some((n) => t.includes(n))) return group;
    }
    return OTHER_DOMAIN;
  }

  /** Build the full markdown report (one Mermaid erDiagram per domain + cross-domain table). */
  static async buildMarkdown(intro: IntrospectionResult): Promise<string> {
    const { tables, columns, fks } = intro;

    const colsByTable = new Map<string, ColumnInfo[]>();
    for (const c of columns) {
      if (!colsByTable.has(c.table)) colsByTable.set(c.table, []);
      colsByTable.get(c.table)!.push(c);
    }

    // Group tables by domain.
    const groups = new Map<string, string[]>();
    for (const t of tables) {
      const g = this.domainOf(t);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(t);
    }
    const domainOfTable = new Map<string, string>();
    for (const t of tables) domainOfTable.set(t, this.domainOf(t));

    const sanitizeType = (t: string) =>
      t.replace(/ /g, '_').replace('character_varying', 'varchar').replace('timestamp_with_time_zone', 'timestamptz');

    const lines: string[] = [];
    lines.push(`# ${ERD_TITLE}`);
    lines.push('');
    lines.push(`Generated from live schema introspection. **${tables.length} tables**, **${fks.length} foreign keys**.`);
    lines.push('');

    // Domain summary table.
    lines.push('## Domains');
    lines.push('');
    lines.push('| Domain | Tables |');
    lines.push('| --- | --- |');
    const orderedGroups = [...groups.keys()].sort();
    for (const g of orderedGroups) {
      lines.push(`| ${g} | ${groups.get(g)!.length} |`);
    }
    lines.push('');

    // One erDiagram per domain.
    for (const g of orderedGroups) {
      const groupTables = new Set(groups.get(g)!);
      lines.push(`## ${g}`);
      lines.push('');
      lines.push('```mermaid');
      lines.push('erDiagram');
      for (const t of groups.get(g)!) {
        lines.push(`  ${t} {`);
        for (const c of colsByTable.get(t) ?? []) {
          lines.push(`    ${sanitizeType(c.type)} ${c.column}${c.ispk ? ' PK' : ''}`);
        }
        lines.push('  }');
      }
      // Intra-domain FK edges only (cross-domain handled separately).
      const seen = new Set<string>();
      for (const f of fks) {
        if (!groupTables.has(f.src) || !groupTables.has(f.tgt)) continue;
        const key = `${f.src}|${f.tgt}|${f.srccol}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`  ${f.tgt} ||--o{ ${f.src} : "${f.srccol}"`);
      }
      lines.push('```');
      lines.push('');
    }

    // Cross-domain references (kept as a table instead of a giant overview diagram).
    const cross = fks.filter((f) => domainOfTable.get(f.src) !== domainOfTable.get(f.tgt));
    if (cross.length) {
      lines.push('## Cross-domain references');
      lines.push('');
      lines.push('| From (domain.table) | Column | To (domain.table) |');
      lines.push('| --- | --- | --- |');
      for (const f of cross) {
        lines.push(`| ${domainOfTable.get(f.src)}.${f.src} | ${f.srccol} | ${domainOfTable.get(f.tgt)}.${f.tgt} |`);
      }
      lines.push('');
    }

    lines.push(...(await this.buildAnalysis(intro, colsByTable)));

    return lines.join('\n');
  }

  /**
   * Detect potential schema issues — especially missing referential integrity, which is
   * common in databases converted/imported from other platforms (e.g. HFSQL/WinDev) where
   * foreign keys were never enforced. Flags are advisory, not errors.
   */
  static async buildAnalysis(intro: IntrospectionResult, colsByTable: Map<string, ColumnInfo[]>): Promise<string[]> {
    const { tables, columns, fks } = intro;
    const out: string[] = [];

    // Tables with no primary key.
    const noPk = tables.filter((t) => !(colsByTable.get(t) ?? []).some((c) => c.ispk));

    // Columns that look like foreign keys (end in "id", not the PK) but have no enforced FK.
    const fkColSet = new Set(fks.map((f) => `${f.src}.${f.srccol}`));
    const unenforced = columns.filter(
      (c) =>
        !c.ispk &&
        /id$/i.test(c.column) &&
        c.column.toLowerCase() !== 'id' &&
        !fkColSet.has(`${c.table}.${c.column}`),
    );

    // Isolated tables — appear in no FK edge (neither side).
    const inFk = new Set<string>();
    for (const f of fks) { inFk.add(f.src); inFk.add(f.tgt); }
    const isolated = tables.filter((t) => !inFk.has(t));

    // Near-duplicate tables (singular/plural pairs).
    const tableSet = new Set(tables);
    const dupPairs: Array<[string, string]> = [];
    const seenDup = new Set<string>();
    for (const t of tables) {
      const partner = t.endsWith('s') ? t.slice(0, -1) : `${t}s`;
      if (tableSet.has(partner)) {
        const key = [t, partner].sort().join('|');
        if (!seenDup.has(key)) { seenDup.add(key); dupPairs.push([t, partner]); }
      }
    }

    out.push('## Analysis & potential issues');
    out.push('');
    out.push(
      'Advisory checks against the live schema. These matter most for **converted/imported ' +
        'databases** (e.g. HFSQL/WinDev), which frequently arrive with **no enforced referential ' +
        'integrity** — every implied relationship below would be a constraint to add.',
    );
    out.push('');
    out.push('| Check | Count |');
    out.push('| --- | --- |');
    out.push(`| Tables without a primary key | ${noPk.length} |`);
    out.push(`| Columns ending in "id" with no enforced FK | ${unenforced.length} |`);
    out.push(`| Isolated tables (no relationships) | ${isolated.length} |`);
    out.push(`| Possible duplicate/near-duplicate tables | ${dupPairs.length} |`);
    out.push('');

    out.push('### Tables without a primary key');
    out.push('');
    out.push(noPk.length ? noPk.map((t) => `- \`${t}\``).join('\n') : '_None._');
    out.push('');

    out.push(...(await this.buildRiSuggestions(unenforced, colsByTable, tableSet)));

    out.push('### Isolated tables (no relationships)');
    out.push('');
    out.push(isolated.length ? isolated.map((t) => `- \`${t}\``).join('\n') : '_None._');
    out.push('');

    out.push('### Possible duplicate / near-duplicate tables');
    out.push('');
    out.push(
      dupPairs.length
        ? dupPairs.map(([a, b]) => `- \`${a}\` ↔ \`${b}\``).join('\n')
        : '_None._',
    );
    out.push('');

    // Legacy tables — candidates for removal. Convention here is plural, lowercase,
    // no camelCase; tables that break that (esp. the singular side of a plural pair, or
    // camelCase names) are likely pre-refactor leftovers. Row counts make empties obvious.
    const pluralOf = (t: string) => (t.endsWith('s') ? t : `${t}s`);
    type Candidate = { table: string; reasons: string[] };
    const candidates: Candidate[] = [];
    for (const t of tables) {
      const reasons: string[] = [];
      if (/[A-Z]/.test(t)) reasons.push('camelCase name (convention is lowercase)');
      if (!t.endsWith('s') && tableSet.has(pluralOf(t))) {
        reasons.push(`singular — current table is \`${pluralOf(t)}\``);
      }
      if (reasons.length) candidates.push({ table: t, reasons });
    }
    const counts = await this.rowCounts(candidates.map((c) => c.table));

    out.push('### Legacy tables — candidates for removal');
    out.push('');
    if (candidates.length) {
      out.push(
        'Tables that break the naming convention (camelCase, or a singular whose current ' +
          'plural exists) — likely pre-refactor leftovers. **Verify before dropping**; empty ' +
          'ones are the safest to remove.',
      );
      out.push('');
      out.push('| Table | Rows | Why flagged |');
      out.push('| --- | --- | --- |');
      for (const c of candidates) {
        const n = counts.get(c.table);
        const rowsLabel = n === -1 ? 'unreadable' : n === 0 ? '**0 (empty)**' : String(n);
        out.push(`| \`${c.table}\` | ${rowsLabel} | ${c.reasons.join('; ')} |`);
      }
    } else {
      out.push('_None — all tables follow the plural, lowercase convention._');
    }
    out.push('');

    return out;
  }

  /** Public: introspect + build markdown (no persistence). */
  static async generateMarkdown(): Promise<string> {
    const intro = await this.introspect();
    return this.buildMarkdown(intro);
  }

  /** Exact row counts for a small set of tables (used for legacy-removal judgement). */
  static async rowCounts(tables: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const t of tables) {
      try {
        const r = await pool.query<{ n: number }>(`select count(*)::int as n from "${t}"`);
        counts.set(t, r.rows[0]?.n ?? 0);
      } catch {
        counts.set(t, -1); // unreadable
      }
    }
    return counts;
  }

  /** Generate markdown + PDF and upsert the single global wxkanbandocuments row. */
  static async generateAndStore(createdbyid?: string): Promise<{ id: string; bytes: number }> {
    const markdown = await this.generateMarkdown();
    const pdf = await MarkdownPdfRenderer.renderToPdf(markdown, ERD_TITLE);

    const existing = await db
      .select({ id: wxkanbandocuments.id })
      .from(wxkanbandocuments)
      .where(eq(wxkanbandocuments.documenttype, ERD_DOCUMENTTYPE))
      .limit(1);

    const now = new Date();
    let id: string;
    if (existing.length) {
      id = existing[0].id;
      await db.update(wxkanbandocuments).set({
        title: ERD_TITLE,
        filecontent: markdown,
        pdfcontent: pdf,
        pdfgeneratedat: now,
        updatedat: now,
        status: 'active',
      }).where(eq(wxkanbandocuments.id, id));
    } else {
      const inserted = await db.insert(wxkanbandocuments).values({
        documenttype: ERD_DOCUMENTTYPE,
        title: ERD_TITLE,
        filecontent: markdown,
        pdfcontent: pdf,
        pdfgeneratedat: now,
        status: 'active',
        createdby: createdbyid ?? null,
      }).returning({ id: wxkanbandocuments.id });
      id = inserted[0].id;
    }

    logger.info({ id, bytes: pdf.length }, 'ER diagram generated and stored');
    return { id, bytes: pdf.length };
  }

  /**
   * Teaching-first referential-integrity section. For each key-like column without an
   * enforced foreign key, infer the parent table it should point to, check for orphaned
   * rows that already break that link, and emit the exact SQL to add the rule. Written for
   * people who were never trained as DBAs (the typical conversion audience).
   */
  static async buildRiSuggestions(
    unenforced: ColumnInfo[],
    colsByTable: Map<string, ColumnInfo[]>,
    tableSet: Set<string>,
  ): Promise<string[]> {
    const out: string[] = [];
    out.push('### Referential integrity — suggested fixes');
    out.push('');
    out.push(
      '**What this is, in plain terms.** A *foreign key* is a safety rule that says "the ' +
        'value in this column must match a real row in another table." For example, every ' +
        '`projectid` on a task should point to a project that actually exists. Without the rule, ' +
        'the database will silently accept a task pointing at a project that was deleted or ' +
        'never existed — a broken link you only discover when something crashes or a report ' +
        'is wrong. **Converted databases usually arrive with these rules missing entirely.**',
    );
    out.push('');
    out.push(
      '*Orphaned rows* are rows that **already** break the rule (the value points to nothing). ' +
        'You must clean those up first — the database will refuse to add a rule the existing ' +
        'data already violates.',
    );
    out.push('');

    if (!unenforced.length) {
      out.push('_Nothing to suggest — every key-like column already has an enforced foreign key._');
      out.push('');
      return out;
    }

    // Best-effort parent inference. Naming is irregular, so a small known map covers the
    // common irregular cases; everything else falls back to simple pluralisation matching.
    const known: Record<string, string> = {};
    const map: Array<[string, string]> = [
      ['user', 'userprofiles'], ['createdby', 'userprofiles'], ['updatedby', 'userprofiles'],
      ['assignedto', 'userprofiles'], ['assignedby', 'userprofiles'], ['claimedby', 'userprofiles'],
      ['dispositionedby', 'userprofiles'], ['queuedby', 'userprofiles'], ['triggeredby', 'userprofiles'],
      ['company', 'companies'], ['project', 'companyprojects'], ['spec', 'projectspecifications'],
      ['task', 'projecttasks'], ['phase', 'projectphases'], ['engagement', 'engagements'],
      ['campaign', 'campaigns'], ['asset', 'marketingassets'],
    ];
    for (const [base, tbl] of map) if (tableSet.has(tbl)) known[base] = tbl;

    const pkOf = (t: string): string =>
      (colsByTable.get(t) ?? []).find((c) => c.ispk)?.column ?? 'id';

    const inferParent = (column: string): string | null => {
      const base = column.toLowerCase().replace(/id$/, '');
      if (!base) return null;
      if (known[base]) return known[base];
      if (tableSet.has(`${base}s`)) return `${base}s`;
      if (tableSet.has(base)) return base;
      const ends = [...tableSet].filter((t) => t.endsWith(`${base}s`) || t.endsWith(base));
      return ends.length === 1 ? ends[0] : null;
    };

    interface Suggestion { child: string; col: string; parent: string; pk: string; orphans: number; }
    const suggestions: Suggestion[] = [];
    const unknown: ColumnInfo[] = [];

    for (const c of unenforced) {
      const parent = inferParent(c.column);
      if (!parent) { unknown.push(c); continue; }
      const pk = pkOf(parent);
      let orphans = -1;
      try {
        const r = await pool.query<{ n: number }>(
          `select count(*)::int as n from "${c.table}" ch
             where ch."${c.column}" is not null
               and not exists (
                 select 1 from "${parent}" p where p."${pk}"::text = ch."${c.column}"::text
               )`,
        );
        orphans = r.rows[0]?.n ?? 0;
      } catch {
        orphans = -1; // type mismatch / unreadable — show as unknown
      }
      suggestions.push({ child: c.table, col: c.column, parent, pk, orphans });
    }

    if (suggestions.length) {
      out.push('**Suggested relationships.** Each row below is a link we believe should exist.');
      out.push('');
      out.push('| This column… | …should point to | Orphaned rows now | Status |');
      out.push('| --- | --- | --- | --- |');
      for (const s of suggestions) {
        const status =
          s.orphans === -1
            ? 'check manually (type mismatch)'
            : s.orphans === 0
              ? '✅ ready to add'
              : `⚠️ clean ${s.orphans} orphaned row(s) first`;
        const orphLabel = s.orphans === -1 ? '?' : String(s.orphans);
        out.push(`| \`${s.child}.${s.col}\` | \`${s.parent}.${s.pk}\` | ${orphLabel} | ${status} |`);
      }
      out.push('');
      out.push('**The exact commands to add these rules.** Run the ✅ ones as-is; for ⚠️ ones, fix the orphaned rows first (the comment shows how many).');
      out.push('');
      out.push('```sql');
      for (const s of suggestions) {
        const cname = `fk_${s.child}_${s.col}`.slice(0, 63);
        if (s.orphans > 0) {
          out.push(`-- ⚠️ ${s.orphans} orphaned row(s) — clean these before adding, e.g.:`);
          out.push(`--   UPDATE "${s.child}" SET "${s.col}" = NULL WHERE "${s.col}" NOT IN (SELECT "${s.pk}" FROM "${s.parent}");`);
        }
        out.push(`ALTER TABLE "${s.child}" ADD CONSTRAINT "${cname}" FOREIGN KEY ("${s.col}") REFERENCES "${s.parent}" ("${s.pk}");`);
      }
      out.push('```');
      out.push('');
    }

    if (unknown.length) {
      out.push('**Couldn\'t auto-match these — you decide the parent table.** The column name didn\'t clearly map to one table (or it may not be a reference at all, e.g. an external/Stripe id).');
      out.push('');
      out.push(unknown.map((c) => `- \`${c.table}.${c.column}\``).join('\n'));
      out.push('');
    }

    return out;
  }

  /** Fetch the stored markdown (with mermaid fences) for inline rendering, or null. */
  static async getStoredMarkdown(): Promise<{ markdown: string; generatedat: Date | null } | null> {
    const rows = await db
      .select({ md: wxkanbandocuments.filecontent, generatedat: wxkanbandocuments.pdfgeneratedat })
      .from(wxkanbandocuments)
      .where(eq(wxkanbandocuments.documenttype, ERD_DOCUMENTTYPE))
      .limit(1);
    if (!rows.length || !rows[0].md) return null;
    return { markdown: rows[0].md, generatedat: rows[0].generatedat ?? null };
  }

  /** Fetch the stored PDF bytes (or null if not generated yet). */
  static async getStoredPdf(): Promise<{ pdf: Buffer; generatedat: Date | null } | null> {
    const rows = await db
      .select({ pdf: wxkanbandocuments.pdfcontent, generatedat: wxkanbandocuments.pdfgeneratedat })
      .from(wxkanbandocuments)
      .where(eq(wxkanbandocuments.documenttype, ERD_DOCUMENTTYPE))
      .limit(1);
    if (!rows.length || !rows[0].pdf) return null;
    return { pdf: rows[0].pdf as Buffer, generatedat: rows[0].generatedat ?? null };
  }
}
// [SCOPE 021 / T011] END
