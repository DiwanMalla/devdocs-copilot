"use client";

import { useEffect, useRef } from "react";

export function ScrollToLine({ line }: { line: number }) {
  const targetRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    targetRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [line]);

  return <span ref={targetRef} className="sr-only" aria-hidden="true" />;
}
