import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T006] BEGIN — Live schema types
export interface LiveColumn {
  name: string;
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
}

export interface LiveForeignKey {
  name: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface LiveIndex {
  name: string;
  columns: string[];
  unique: boolean;
  /** The WHERE predicate of a partial index; null when the index is not partial. */
  predicate: string | null;
  /**
   * True when at least one indexed position is an expression rather than a
   * bare column (e.g. `lower(name)`). Those positions still appear in
   * `columns` as the literal marker `"(expression)"` so array length and
   * ordinal position stay aligned with the real index definition — this
   * field exists so a consumer can detect that case without string-sniffing
   * `columns` for the marker.
   */
  hasExpression: boolean;
}

export interface LiveTable {
  name: string;
  columns: LiveColumn[];
  foreignKeys: LiveForeignKey[];
  indexes: LiveIndex[];
}

export interface LiveSchema {
  tables: Map<string, LiveTable>;
}
// [SCOPE 121 / T006] END

// [SCOPE 121 / T006] BEGIN — Catalog queries
/**
 * pg_catalog, NOT information_schema.
 *
 * information_schema is privilege-filtered: it lists only objects the
 * connecting role holds a privilege on. A least-privilege role would therefore
 * see a short list, and every unseen object would be reported as missing —
 * turning a permissions difference into a false drift report. pg_catalog is
 * unfiltered and needs only CONNECT plus schema USAGE.
 */
export const COLUMNS_SQL = `
  select
    c.relname                                  as table_name,
    a.attname                                  as column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as sql_type,
    a.attnotnull                               as not_null,
    (a.atthasdef or a.attidentity <> '')       as has_default,
    coalesce(pk.is_pk, false)                  as is_primary_key
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  left join lateral (
    select true as is_pk
    from pg_catalog.pg_constraint pc
    where pc.conrelid = c.oid and pc.contype = 'p' and a.attnum = any(pc.conkey)
  ) pk on true
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and a.attnum > 0
    and not a.attisdropped
  order by c.relname, a.attnum`;

export const CONSTRAINTS_SQL = `
  select
    con.conname as constraint_name,
    child.relname as table_name,
    (select array_agg(att.attname order by k.ord)
       from unnest(con.conkey) with ordinality k(attnum, ord)
       join pg_catalog.pg_attribute att
         on att.attrelid = con.conrelid and att.attnum = k.attnum) as columns,
    parent.relname as foreign_table,
    (select array_agg(att.attname order by k.ord)
       from unnest(con.confkey) with ordinality k(attnum, ord)
       join pg_catalog.pg_attribute att
         on att.attrelid = con.confrelid and att.attnum = k.attnum) as foreign_columns,
    case con.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
         when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' end as on_delete,
    case con.confupdtype when 'a' then 'no action' when 'r' then 'restrict'
         when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' end as on_update
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid = con.conrelid
  join pg_catalog.pg_class parent on parent.oid = con.confrelid
  join pg_catalog.pg_namespace n on n.oid = child.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
  order by child.relname, con.conname`;

/**
 * FIX (SCOPE-121/T006, round 1 — code review Finding 1, Critical): the
 * original inner join to pg_attribute silently dropped expression-index
 * positions. An expression position has `indkey = 0`, which matches no real
 * pg_attribute row; an INNER join then removes that array position entirely,
 * shortening `columns` with no error and no visible gap — a confident,
 * plausible, wrong answer (proven live against
 * idx_customers_consultant_name_live on customer(consultantid, lower(name))
 * WHERE archivedat IS NULL, see task-6-report.md "Fix round 1"). The join is
 * now LEFT so every ordinal position survives, and a position with no
 * matching column is emitted as the literal marker "(expression)" so array
 * length and ordering stay aligned with the true index definition — Task 8
 * reads columns[0] and depends on that alignment. The partial-index
 * predicate (previously not captured at all) is now selected via
 * pg_get_expr(ix.indpred, ix.indrelid), which is null for a non-partial
 * index.
 */
export const INDEXES_SQL = `
  select
    t.relname as table_name,
    i.relname as index_name,
    ix.indisunique as is_unique,
    pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) as predicate,
    (ix.indexprs is not null) as has_expression,
    (select array_agg(coalesce(att.attname, '(expression)') order by k.ord)
       from unnest(ix.indkey::int[]) with ordinality k(attnum, ord)
       left join pg_catalog.pg_attribute att
         on att.attrelid = t.oid and att.attnum = k.attnum) as columns
  from pg_catalog.pg_index ix
  join pg_catalog.pg_class i on i.oid = ix.indexrelid
  join pg_catalog.pg_class t on t.oid = ix.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
  order by t.relname, i.relname`;
// [SCOPE 121 / T006] END

// [SCOPE 121 / T006] BEGIN — Live schema collection
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function tableEntry(tables: Map<string, LiveTable>, name: string): LiveTable {
  const existing = tables.get(name);
  if (existing) return existing;
  const created: LiveTable = {
    name,
    columns: [],
    foreignKeys: [],
    indexes: [],
  };
  tables.set(name, created);
  return created;
}

/** Read the deployed shape of every table in the public schema. */
export async function collectLiveSchema(
  connection: DbConnection,
): Promise<LiveSchema> {
  const tables = new Map<string, LiveTable>();

  for (const row of await connection.query(COLUMNS_SQL)) {
    tableEntry(tables, String(row.table_name)).columns.push({
      name: String(row.column_name),
      sqlType: String(row.sql_type),
      notNull: row.not_null === true,
      hasDefault: row.has_default === true,
      isPrimaryKey: row.is_primary_key === true,
    });
  }

  for (const row of await connection.query(CONSTRAINTS_SQL)) {
    tableEntry(tables, String(row.table_name)).foreignKeys.push({
      name: String(row.constraint_name),
      columns: toStringArray(row.columns),
      foreignTable: String(row.foreign_table),
      foreignColumns: toStringArray(row.foreign_columns),
      onDelete: row.on_delete ? String(row.on_delete) : undefined,
      onUpdate: row.on_update ? String(row.on_update) : undefined,
    });
  }

  for (const row of await connection.query(INDEXES_SQL)) {
    tableEntry(tables, String(row.table_name)).indexes.push({
      name: String(row.index_name),
      columns: toStringArray(row.columns),
      unique: row.is_unique === true,
      predicate: row.predicate == null ? null : String(row.predicate),
      hasExpression: row.has_expression === true,
    });
  }

  return { tables };
}
// [SCOPE 121 / T006] END
