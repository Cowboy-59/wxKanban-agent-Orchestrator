// run-wxkanban — serve the REAL app (createApp: every route + middleware) and the built client
// WITHOUT src/server/index.ts. index.ts also starts background jobs (subscription archival sweep,
// infra health, AI session jobs, auto scope analysis), and the local DATABASE_URL is PRODUCTION.
//
// Bundle with esbuild (see SKILL.md → Build); `tsx` cannot load createApp (scope-stage barrel).
// Run from the repo root so dotenv finds the repo's env file and dist/client resolves.
import "dotenv/config";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import { createApp } from "../../../src/server/app.ts";

const dist = path.join(process.cwd(), "dist", "client");
const outer = express();
outer.use(express.static(dist, { index: false }));
// SPA fallback for page routes. createApp only serves the client when NODE_ENV=production.
outer.get(/^\/(?!api\/|health$).*/, (req: Request, res: Response, next: NextFunction) => {
  if (req.accepts("html")) res.sendFile(path.join(dist, "index.html"));
  else next();
});
outer.use(createApp());

const PORT = Number(process.env.WXK_RUN_PORT ?? 5199);
// A plain stdout ready-marker for the skill's poll loop — dev tooling, not app logging.
outer.listen(PORT, "127.0.0.1", () => process.stdout.write(`READY http://127.0.0.1:${PORT}\n`));
