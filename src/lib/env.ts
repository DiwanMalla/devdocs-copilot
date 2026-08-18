const REQUIRED_APP_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
] as const;

type EnvKey = (typeof REQUIRED_APP_ENV)[number];

export function listMissingEnv(
  keys: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return keys.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function validateRequiredEnv(
  keys: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = listMissingEnv(keys, env);
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    [
      `Missing required environment variables: ${missing.join(", ")}.`,
      "Copy .env.example to .env.local (or set the production environment), then apply the checked-in Supabase migrations before starting the app.",
    ].join(" "),
  );
}

let validated = false;

export function validateAppEnv(): void {
  if (validated) {
    return;
  }
  validateRequiredEnv(REQUIRED_APP_ENV);
  validated = true;
}

export function requiredAppEnvKeys(): readonly EnvKey[] {
  return REQUIRED_APP_ENV;
}
