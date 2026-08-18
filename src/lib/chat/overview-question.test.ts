import { describe, expect, it } from "vitest";
import { isRepoOverviewQuestion } from "./overview-question";

describe("isRepoOverviewQuestion", () => {
  it("detects repository meta questions", () => {
    expect(isRepoOverviewQuestion("What is this project?")).toBe(true);
    expect(isRepoOverviewQuestion("what is this repo")).toBe(true);
    expect(isRepoOverviewQuestion("How does it work?")).toBe(true);
    expect(isRepoOverviewQuestion("What are the main features?")).toBe(true);
    expect(isRepoOverviewQuestion("features")).toBe(true);
  });

  it("does not treat pinpoint source questions as overview", () => {
    expect(isRepoOverviewQuestion("Where is authentication handled?")).toBe(
      false,
    );
    expect(isRepoOverviewQuestion("How does repository ingestion work?")).toBe(
      false,
    );
  });
});
