import "server-only";

import { listMissingEnv, validateRequiredEnv } from "@/lib/env";

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  validateRequiredEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function getSupabaseServiceRoleKey(): string {
  validateRequiredEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  return process.env.SUPABASE_SERVICE_ROLE_KEY as string;
}

export function hasSupabaseConfig(): boolean {
  return (
    listMissingEnv([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]).length === 0
  );
}
