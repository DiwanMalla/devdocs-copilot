import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, shouldSkipPath } from "./filters";
import { isAlwaysIndexPath } from "@/lib/repo/priority-paths";

describe("shouldSkipPath", () => {
  it("never skips README, docs, or package.json", () => {
    expect(shouldSkipPath("README.md")).toBe(false);
    expect(shouldSkipPath("readme")).toBe(false);
    expect(shouldSkipPath("docs/architecture.md")).toBe(false);
    expect(shouldSkipPath("package.json")).toBe(false);
    expect(isAlwaysIndexPath("README.md")).toBe(true);
  });

  it("still skips lockfiles, binaries, and vendored directories", () => {
    expect(shouldSkipPath("package-lock.json")).toBe(true);
    expect(shouldSkipPath("logo.png")).toBe(true);
    expect(shouldSkipPath("node_modules/README.md")).toBe(true);
    expect(MAX_FILE_BYTES).toBeGreaterThan(0);
  });
});
