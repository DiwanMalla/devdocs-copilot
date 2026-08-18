import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { kickIngestWorker, processNextIngestJob } from "@/lib/github/ingest";
import { validateAppEnv } from "@/lib/env";
import { bootstrap } from "@/server/bootstrap";

bootstrap();

export const maxDuration = 300;

export async function GET(): Promise<Response> {
  validateAppEnv();
  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response("Authentication required.", { status: 401 });
  }

  try {
    const result = await processNextIngestJob();
    return Response.json(result);
  } catch (error) {
    console.error("Durable repository indexing worker failed", error);
    return new Response("Indexing worker failed.", { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  validateAppEnv();
  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response("Authentication required.", { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new Response("Invalid indexing request.", { status: 400 });
  }

  const jobId =
    "jobId" in body && typeof body.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return new Response("A job ID is required.", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("ingest_jobs")
    .select("id, user_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job || job.user_id !== user.id) {
    return new Response("Indexing job not found.", { status: 404 });
  }

  kickIngestWorker();
  return Response.json({ accepted: true, status: job.status });
}
