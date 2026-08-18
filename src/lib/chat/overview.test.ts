import { describe, expect, it } from "vitest";
import { REPO_OVERVIEW_PATH } from "./overview-question";
import {
  buildFallbackOverviewAnswer,
  buildRepoOverviewChunk,
  mergeRetrievalWithOverview,
  parsePackageJsonDescription,
} from "./overview";
import type { SemanticSearchResult } from "@/lib/ai/search";

const readme: SemanticSearchResult = {
  chunk_id: "readme-1",
  file_id: "file-1",
  path: "README.md",
  language: "md",
  start_line: 1,
  end_line: 8,
  content: "DevDocs Copilot answers grounded questions about a GitHub repo.",
  similarity: 0.9,
};

describe("repo overview fallback", () => {
  it("builds a synthetic overview chunk from name, description, and summary", () => {
    const chunk = buildRepoOverviewChunk({
      repoId: "repo-1",
      owner: "DiwanMalla",
      name: "devdocs-copilot",
      description: "Ask grounded questions about any public GitHub repo.",
      summary: "## Summary\nRAG over GitHub source.",
      packageDescription: "DevDocs Copilot",
    });

    expect(chunk.path).toBe(REPO_OVERVIEW_PATH);
    expect(chunk.content).toContain("DiwanMalla/devdocs-copilot");
    expect(chunk.content).toContain("Ask grounded questions");
    expect(chunk.content).toContain("RAG over GitHub source");
    expect(chunk.content).toContain("DevDocs Copilot");
  });

  it("never returns an empty overview answer", () => {
    const answer = buildFallbackOverviewAnswer({
      owner: "DiwanMalla",
      name: "devdocs-copilot",
      description: "Ask grounded questions about any public GitHub repo.",
      summary: null,
      chunks: [readme],
    });

    expect(answer.length).toBeGreaterThan(20);
    expect(answer.toLowerCase()).not.toContain("insufficient evidence");
    expect(answer).toContain("[README.md:L1-L8]");
  });

  it("prepends overview context ahead of retrieved chunks", () => {
    const overview = buildRepoOverviewChunk({
      repoId: "repo-1",
      owner: "acme",
      name: "docs",
      description: "Docs",
      summary: null,
      packageDescription: null,
    });
    const merged = mergeRetrievalWithOverview([readme], [overview], 8);
    expect(merged[0]?.path).toBe(REPO_OVERVIEW_PATH);
    expect(merged.some((chunk) => chunk.path === "README.md")).toBe(true);
  });

  it("reads package.json description", () => {
    expect(
      parsePackageJsonDescription(
        JSON.stringify({ name: "app", description: "A grounded repo copilot" }),
      ),
    ).toBe("A grounded repo copilot");
    expect(parsePackageJsonDescription("{")).toBeNull();
  });
});
