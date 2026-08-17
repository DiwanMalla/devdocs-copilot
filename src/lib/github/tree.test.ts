import { describe, expect, it } from "vitest";
import { assertIndexableTree, SnapshotIndexError } from "./tree";

describe("assertIndexableTree", () => {
  it("rejects truncated GitHub trees", () => {
    expect(() =>
      assertIndexableTree({ truncated: true, candidateCount: 12 }),
    ).toThrow(SnapshotIndexError);
    try {
      assertIndexableTree({ truncated: true, candidateCount: 12 });
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotIndexError);
      expect((error as SnapshotIndexError).code).toBe("truncated");
    }
  });

  it("rejects repositories over the file cap", () => {
    expect(() =>
      assertIndexableTree({ truncated: false, candidateCount: 251 }),
    ).toThrow(/250-file snapshot limit/);
  });

  it("rejects empty candidate sets", () => {
    expect(() =>
      assertIndexableTree({ truncated: false, candidateCount: 0 }),
    ).toThrow(SnapshotIndexError);
  });

  it("allows a complete in-limit tree", () => {
    expect(() =>
      assertIndexableTree({ truncated: false, candidateCount: 12 }),
    ).not.toThrow();
  });
});
