import { Suspense } from "react";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-8 space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Sign in to DevDocs Copilot
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          Paste a GitHub repository, index a snapshot, then ask grounded
          questions with clickable citations.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            GitHub is the fastest way in. Email and password works as a fallback.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
