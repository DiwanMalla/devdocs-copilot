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
        <p className="text-muted-foreground text-sm">Your private code workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Sign in to DevDocs Copilot
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          GitHub is the fastest way in. Email and password is available as a
          fallback. Repositories, chats, and citations stay scoped to your
          account.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Public GitHub repositories only. Private repo access comes later.
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
