import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "./server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
