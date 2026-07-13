// SAFETY: Enforce simulation-only mode in v1 (Hito 9.1 / SAFETY.md)
if (process.env.SIMULATION_MODE && process.env.SIMULATION_MODE !== "paper_only") {
  throw new Error(
    "SAFETY: SIMULATION_MODE must be 'paper_only' in v1. " +
    "Real execution is not available in this version."
  );
}

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

// ─── Resolve Database URL ──────────────────────────────────────
// Priority:
//   1. TURSO_DATABASE_URL + TURSO_AUTH_TOKEN → Turso remote (Vercel)
//   2. DATABASE_URL → custom path or local file
//   3. Default → ./data/mesirve.db (local development)

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let dbUrl: string;
let authToken: string | undefined;

if (tursoUrl) {
  // Turso remote — use HTTP URL directly (works on Vercel serverless)
  dbUrl = tursoUrl;
  authToken = tursoToken;
} else {
  // Local SQLite file
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const filePath = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL.slice(5)
    : process.env.DATABASE_URL || "./data/mesirve.db";

  dbUrl = `file:${path.resolve(filePath)}`;
}

const client = createClient({ url: dbUrl, authToken });

// Enable WAL mode + foreign keys for local SQLite.
// Fire-and-forget — these PRAGMAs are not critical for correctness
// (WAL mode persists across connections on existing DB files).
if (!tursoUrl) {
  client.execute("PRAGMA journal_mode = WAL").catch(() => {});
  client.execute("PRAGMA foreign_keys = ON").catch(() => {});
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
export * from "drizzle-orm";
