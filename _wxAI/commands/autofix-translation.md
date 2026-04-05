# autofix-translation — MSSQL → PostgreSQL Translation Pipeline

## Purpose
Automatically translate Microsoft SQL Server schemas, stored procedures, and queries to PostgreSQL-compatible syntax. All operations are captured via MCP Project Hub for audit trail.

## Usage
```bash
{{ai_config_dir}}/autofix-translation {{args}}
```

## Arguments
- `source-path` (required): Path to MSSQL files or directory
- `output-path` (required): Directory for translated PostgreSQL files
- `--schema-only` (optional): Only translate CREATE TABLE statements
- `--procedures` (optional): Include stored procedure translation

## MCP Tools Used
- `project.capture_event` — Log translation operations
- `project.upsert_document` — Create translation report

## Translation Steps

### 1. Capture Start Event
- [ ] Call `project.capture_event` with:
  - `type`: "translation_started"
  - `source`: "cli"
  - `rawContent`: "Starting MSSQL→PostgreSQL translation: {{source-path}} → {{output-path}}"
  - Store returned `eventId` as `translationEventId`

### 2. Parse MSSQL Source
- [ ] Read `.sql` files from source path
- [ ] Identify MSSQL-specific syntax:
  - `IDENTITY` columns → `SERIAL` or `GENERATED ALWAYS AS IDENTITY`
  - `DATETIME` → `TIMESTAMP` or `TIMESTAMPTZ`
  - `NVARCHAR` → `VARCHAR` with proper encoding
  - `TOP N` → `LIMIT N`
  - `GETDATE()` → `NOW()`
  - `ISNULL()` → `COALESCE()`
  - `+` string concat → `||` operator
  - Square brackets `[]` → Double quotes `""`
  - `GO` batch separators → Remove or replace with semicolons
- [ ] Call `project.capture_event` with:
  - `type`: "translation_analysis"
  - `source`: "cli"
  - `rawContent`: "Analyzed {{file_count}} files, found {{construct_count}} MSSQL-specific constructs"

### 3. Schema Translation
- [ ] Convert CREATE TABLE statements
- [ ] Map data types:
  | MSSQL | PostgreSQL |
  |-------|------------|
  | `INT` | `INTEGER` |
  | `BIGINT` | `BIGINT` |
  | `VARCHAR(n)` | `VARCHAR(n)` |
  | `NVARCHAR(n)` | `VARCHAR(n)` |
  | `DATETIME` | `TIMESTAMP` |
  | `DATETIME2` | `TIMESTAMPTZ` |
  | `BIT` | `BOOLEAN` |
  | `VARBINARY` | `BYTEA` |
  | `UNIQUEIDENTIFIER` | `UUID` |
  | `MONEY` | `NUMERIC(19,4)` |
  | `TEXT` | `TEXT` |

### 4. Procedure Translation
- [ ] Convert `CREATE PROCEDURE` → `CREATE OR REPLACE FUNCTION`
- [ ] Convert `BEGIN/END` blocks
- [ ] Handle `IF EXISTS` patterns
- [ ] Convert cursors to PostgreSQL cursor syntax
- [ ] Replace `@@ROWCOUNT` with `GET DIAGNOSTICS`
- [ ] Replace `@@ERROR` with exception handling

### 5. Query Translation
- [ ] Convert `SELECT TOP` → `SELECT ... LIMIT`
- [ ] Convert `FOR XML` → `json_agg` or `to_json`
- [ ] Convert `PIVOT/UNPIVOT` → `crosstab` or CASE expressions
- [ ] Handle `MERGE` → `INSERT ON CONFLICT` or `UPSERT`

### 6. Validation
- [ ] Check for untranslated MSSQL-specific syntax
- [ ] Flag manual review items
- [ ] Call `project.capture_event` with:
  - `type`: "translation_validation"
  - `source`: "cli"
  - `rawContent`: "Validation complete: {{translated_count}} translated, {{review_count}} need manual review"

### 7. Create Report Document
- [ ] Call `project.upsert_document` with:
  - `title`: "Translation Report — {{timestamp}}"
  - `bodyMarkdown`: Full translation report (see Output Format)
  - `sourceEventId`: translationEventId
  - `tags`: ["translation", "mssql", "postgresql", "report"]

## Output Format
```
autofix-translation Report (MCP Project Hub)
===========================================
Event captured:      ✅ translation_started (event-id: xxx)

Source:              {{source-path}}
Output:              {{output-path}}

Files processed:     12
  ✅ Translated:     10
  ⚠️  Partial:        2 (manual review needed)

Translation Summary:
  Tables:            8
  Procedures:        4
  Functions:         2
  Views:             3

Manual Review Required:
  ⚠️  procedures/ComplexPivot.sql — PIVOT requires manual CASE rewrite
  ⚠️  functions/ClrFunction.sql — CLR functions not supported in PostgreSQL

MCP Tools Used:
  - project.capture_event: 3
  - project.upsert_document: 1

Report document:     ✅ Created in projectdocuments
Output files:        ✅ Written to {{output-path}}
```

## Error Handling
- Syntax parse errors are logged with line numbers and captured via `project.capture_event`
- Untranslatable constructs are flagged, not skipped
- Output directory is created if it doesn't exist
- All errors are captured as events for audit trail

## Related Commands
- `autofix-tests` — Autonomous test-fix pipeline
- `createSpecs` — Full spec pipeline

## MCP Integration Notes
- All translation operations are captured as events for complete audit trail
- Translation reports are stored as documents for future reference
- Use `project.list_open_items` to check for related database migration tasks
- Never use raw SQL — all data access through MCP tools
