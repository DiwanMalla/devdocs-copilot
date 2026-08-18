import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const required = [
  "001_repos_and_files.sql",
  "002_chunks_and_vector_search.sql",
  "003_auth_workspace.sql",
  "004_production_chat.sql",
  "005_hybrid_retrieval_active_snapshot.sql",
  "20260817145236_durable_ingest_jobs.sql",
  "20260817151537_atomic_chat_rate_limit.sql",
  "20260817151717_fix_atomic_chat_rate_limit.sql",
];

if (!existsSync(migrationsDir)) {
  console.error("Migration verification failed. Missing `supabase/migrations` directory.");
  process.exit(1);
}

const present = new Set(readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")));
const missing = required.filter((file) => !present.has(file));

if (missing.length > 0) {
  console.error(
    [
      "Migration verification failed.",
      `Missing checked-in migrations: ${missing.join(", ")}.`,
      "Restore the SQL files or update this verifier if the migration set intentionally changed.",
    ].join(" "),
  );
  process.exit(1);
}

console.log(`Migration verification passed for ${required.length} checked-in SQL files.`);
