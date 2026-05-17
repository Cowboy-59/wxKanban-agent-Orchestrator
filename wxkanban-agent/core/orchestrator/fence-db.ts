import { FenceDbWrite } from "./fence-emitter";

export interface FenceDbClient {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export async function applyFenceDbWrites(
  client: FenceDbClient,
  projectId: string,
  filepath: string,
  writes: FenceDbWrite[],
): Promise<void> {
  for (const write of writes) {
    switch (write.kind) {
      case "create":
        await client.query(
          `INSERT INTO taskfences
             (projectid, filepath, unitkind, unitname, ownerscope, ownertask,
              description, contenthash, linestart, lineend)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (projectid, filepath, unitkind, unitname)
           DO UPDATE SET
             ownerscope = EXCLUDED.ownerscope,
             ownertask = EXCLUDED.ownertask,
             description = EXCLUDED.description,
             contenthash = EXCLUDED.contenthash,
             linestart = EXCLUDED.linestart,
             lineend = EXCLUDED.lineend,
             updatedat = NOW()`,
          [
            projectId,
            filepath,
            write.payload["unitkind"],
            write.payload["unitname"],
            write.payload["ownerscope"],
            write.payload["ownertask"],
            write.payload["description"],
            write.payload["contenthash"],
            write.payload["linestart"],
            write.payload["lineend"],
          ],
        );
        break;
      case "update":
        await client.query(
          `UPDATE taskfences
             SET ownerscope = $5,
                 ownertask = $6,
                 description = $7,
                 contenthash = $8,
                 linestart = $9,
                 lineend = $10,
                 updatedat = NOW()
           WHERE projectid = $1 AND filepath = $2 AND unitkind = $3 AND unitname = $4`,
          [
            projectId,
            filepath,
            write.payload["unitkind"],
            write.payload["unitname"],
            write.payload["ownerscope"],
            write.payload["ownertask"],
            write.payload["description"],
            write.payload["contenthash"],
            write.payload["linestart"],
            write.payload["lineend"],
          ],
        );
        break;
      case "modification": {
        const fenceId = write.payload["taskfenceid"];
        if (!fenceId) {
          const { rows } = await client.query<{ id: string }>(
            `SELECT id FROM taskfences
              WHERE projectid = $1 AND filepath = $2 AND unitname = $3
              LIMIT 1`,
            [projectId, filepath, write.payload["unitname"] ?? ""],
          );
          if (rows.length === 0) break;
          await client.query(
            `INSERT INTO taskfencemodifications
               (taskfenceid, modifierscope, modifiertask, description,
                contenthashbefore, contenthashafter)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              rows[0]!.id,
              write.payload["modifierscope"],
              write.payload["modifiertask"],
              write.payload["description"],
              write.payload["contenthashbefore"],
              write.payload["contenthashafter"],
            ],
          );
        } else {
          await client.query(
            `INSERT INTO taskfencemodifications
               (taskfenceid, modifierscope, modifiertask, description,
                contenthashbefore, contenthashafter)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              fenceId,
              write.payload["modifierscope"],
              write.payload["modifiertask"],
              write.payload["description"],
              write.payload["contenthashbefore"],
              write.payload["contenthashafter"],
            ],
          );
        }
        break;
      }
      case "history":
        await client.query(
          `INSERT INTO taskfencehistory
             (projectid, filepath, unitkind, unitname,
              priorownerscope, priorownertask, replacedbyscope, replacedbytask)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            projectId,
            filepath,
            write.payload["unitkind"],
            write.payload["unitname"],
            write.payload["priorownerscope"],
            write.payload["priorownertask"],
            write.payload["replacedbyscope"],
            write.payload["replacedbytask"],
          ],
        );
        break;
    }
  }
}

export async function loadExistingFencesForFile(
  client: FenceDbClient,
  projectId: string,
  filepath: string,
): Promise<
  Array<{
    id: string;
    filepath: string;
    unitkind: string;
    unitname: string;
    ownerscope: string;
    ownertask: string;
    description: string;
    contenthash: string;
    linestart: number;
    lineend: number;
  }>
> {
  const { rows } = await client.query<{
    id: string;
    filepath: string;
    unitkind: string;
    unitname: string;
    ownerscope: string;
    ownertask: string;
    description: string;
    contenthash: string;
    linestart: number;
    lineend: number;
  }>(
    `SELECT id, filepath, unitkind, unitname, ownerscope, ownertask,
            description, contenthash, linestart, lineend
       FROM taskfences
      WHERE projectid = $1 AND filepath = $2`,
    [projectId, filepath],
  );
  return rows;
}
