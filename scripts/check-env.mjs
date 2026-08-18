import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envLocalPath = path.join(process.cwd(), ".env.local");

if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || separator === -1) continue;
    const key = trimmed.slice(0, separator);
    if (!process.env[key]) {
      process.env[key] = trimmed.slice(separator + 1);
    }
  }
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "CRON_SECRET",
];

const missing = required.filter((key) => {
  const value = process.env[key];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error(
    [
      "Environment validation failed.",
      `Missing: ${missing.join(", ")}.`,
      "Copy .env.example to .env.local for local runs, or configure the same variables in CI/production.",
    ].join(" "),
  );
  process.exit(1);
}

console.log(`Environment validation passed for ${required.length} required variables.`);
