"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RepoStatusRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      router.refresh();
    }, 4_000);

    return () => window.clearInterval(timer);
  }, [active, router]);

  return null;
}
