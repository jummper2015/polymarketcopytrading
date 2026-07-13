// SAFETY: Enforce simulation-only mode in v1 (Hito 9.1 / SAFETY.md)
if (process.env.SIMULATION_MODE && process.env.SIMULATION_MODE !== "paper_only") {
  throw new Error(
    "SAFETY: SIMULATION_MODE must be 'paper_only' in v1. " +
    "Real execution is not available in this version."
  );
}

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL.slice(5)
  : process.env.DATABASE_URL || "./data/hermes.db";

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
export type Database = typeof db;
export * from "drizzle-orm";
