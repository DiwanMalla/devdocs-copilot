"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RepoStatusRefresh({
  active,
  kickWorker = false,
}: {
  active: boolean;
  kickWorker?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    const tick = () => {
      if (kickWorker) {
        void fetch("/api/index", { method: "GET" });
      }
      router.refresh();
    };

    tick();
    const timer = window.setInterval(tick, 4_000);
    return () => window.clearInterval(timer);
  }, [active, kickWorker, router]);

  return null;
}
