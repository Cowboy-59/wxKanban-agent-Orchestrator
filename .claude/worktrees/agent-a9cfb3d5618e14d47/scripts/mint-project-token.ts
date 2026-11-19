/**
 * One-off: mint a hosted-MCP API token for a project that has none.
 *
 * Mirrors ApiTokenService.createToken exactly (base64url cleartext, sha256 hash,
 * 12-char prefix) and inserts a row into `mcpapitokens`.
 *
 * MUST be run against the SAME database mcp.wxperts.com reads (the App Runner
 * DATABASE_URL) — not the local dev DB, or the hosted MCP still won't find it.
 *
 *   DATABASE_URL="<apprunner prod connection>" \
 *     npx tsx scripts/mint-project-token.ts "SyncDB"
 */
import crypto from 'crypto';
import postgres from 'postgres';

const projectName = process.argv[2] ?? 'SyncDB';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the App Runner prod DB before running.');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require' });

async function main() {
  const [project] = await sql`
    SELECT id, companyid, userid, name
    FROM companyprojects
    WHERE name = ${projectName}
    LIMIT 1
  `;
  if (!project) {
    console.error(`No project named "${projectName}" in this database.`);
    process.exit(2);
  }
  if (!project.companyid) {
    console.error(`Project "${projectName}" has no companyid — cannot scope a token.`);
    process.exit(2);
  }

  // Don't double-mint if an active token already exists.
  const [existing] = await sql`
    SELECT tokenprefix FROM mcpapitokens
    WHERE projectid = ${project.id} AND revokedat IS NULL
    LIMIT 1
  `;
  if (existing) {
    console.error(`Active token already exists (prefix ${existing.tokenprefix}). Aborting.`);
    process.exit(3);
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenprefix = token.substring(0, 12);
  const tokenhash = crypto.createHash('sha256').update(token).digest('hex');

  const [row] = await sql`
    INSERT INTO mcpapitokens
      (customerid, projectid, issuedbyid, tokenprefix, tokenhash, name)
    VALUES
      (${project.companyid}, ${project.id}, ${project.userid},
       ${tokenprefix}, ${tokenhash}, ${'minted ' + projectName})
    RETURNING id, projectid, tokenprefix
  `;

  console.log('\n=== Token minted — store it now, it is shown ONCE ===');
  console.log('Project   :', project.name, project.id);
  console.log('Token id  :', row.id);
  console.log('Prefix    :', row.tokenprefix);
  console.log('\nWXKANBAN_API_TOKEN=' + token + '\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => sql.end());
