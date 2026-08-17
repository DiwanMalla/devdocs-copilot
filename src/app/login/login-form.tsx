"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/supabase/redirect";

const AUTH_ERRORS: Record<string, string> = {
  oauth: "GitHub sign-in failed. Confirm the OAuth callback URL in Supabase.",
  missing_code: "GitHub did not return an authorization code.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"github" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(
    AUTH_ERRORS[searchParams.get("error") ?? ""] ?? null,
  );
  const [isError, setIsError] = useState(Boolean(searchParams.get("error")));

  const next = safeNextPath(searchParams.get("next"));

  async function signInWithGitHub() {
    setPending("github");
    setMessage(null);
    setIsError(false);

    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectTo.toString() },
    });

    if (error) {
      setPending(null);
      setIsError(true);
      setMessage(error.message);
    }
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setMessage(null);
    setIsError(false);

    const supabase = createClient();
    const emailRedirectTo = new URL("/auth/callback", window.location.origin);
    emailRedirectTo.searchParams.set("next", next);

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: emailRedirectTo.toString() },
          });

    setPending(null);

    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }

    if (mode === "signup") {
      setIsError(false);
      setMessage("Check your email to confirm the account, then sign in.");
      return;
    }

    window.location.assign(next);
  }

  return (
    <div className="space-y-6">
      <Button
        type="button"
        className="w-full"
        size="lg"
        onClick={() => void signInWithGitHub()}
        disabled={pending !== null}
      >
        {pending === "github" ? <Loader2Icon className="animate-spin" /> : null}
        Continue with GitHub
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        or email and password
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={(event) => void handleEmailAuth(event)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending !== null}
          />
        </div>
        {message ? (
          <p
            className={isError ? "text-destructive text-sm" : "text-muted-foreground text-sm"}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === "email" ? (
            <>
              <Loader2Icon className="animate-spin" />
              {mode === "signin" ? "Signing in…" : "Creating account…"}
            </>
          ) : mode === "signin" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground w-full text-sm underline-offset-4 hover:underline"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMessage(null);
          setIsError(false);
        }}
      >
        {mode === "signin"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
