import { Suspense } from "react";
import Link from "next/link";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { LoginForm } from "./login-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <div className="mb-8 space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
            DevDocs Copilot
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Ask any GitHub repo. Get cited answers.
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            Skip setup: the public demo already has this repository indexed.
          </p>
          <Button asChild size="lg">
            <Link href="/demo">Open live demo</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Or sign in</CardTitle>
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
      </div>

      <ArchitectureDiagram />
    </main>
  );
}
