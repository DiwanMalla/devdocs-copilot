import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("allows in-app paths and rejects open redirects", () => {
    expect(safeNextPath("/repos/owner/name")).toBe("/repos/owner/name");
    expect(safeNextPath("/login")).toBe("/login");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
