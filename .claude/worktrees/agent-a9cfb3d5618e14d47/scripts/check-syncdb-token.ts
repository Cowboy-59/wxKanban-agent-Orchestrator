import postgres from 'postgres';
const s = postgres(process.env.SOURCE_DATABASE_URL!, { ssl: 'require', prepare: false });
const d = postgres(process.env.DEST_DATABASE_URL!, { ssl: 'require', prepare: false });
const q = (db: postgres.Sql) => db`
  SELECT t.tokenprefix, t.revokedat FROM mcpapitokens t
  JOIN companyprojects p ON p.id = t.projectid WHERE p.name = 'SyncDB'`;
const srcTok = await q(s);
const dstTok = await q(d);
console.log('Supabase (source) SyncDB tokens:', srcTok.length, srcTok.map((r) => ({ prefix: r.tokenprefix, revoked: !!r.revokedat })));
console.log('pgkanban (dest)   SyncDB tokens:', dstTok.length, dstTok.map((r) => ({ prefix: r.tokenprefix, revoked: !!r.revokedat })));
const sp = await s`SELECT id FROM companyprojects WHERE name='SyncDB'`;
const dp = await d`SELECT id FROM companyprojects WHERE name='SyncDB'`;
console.log('SyncDB project present -> source:', sp.length, 'dest:', dp.length);
await s.end(); await d.end();
