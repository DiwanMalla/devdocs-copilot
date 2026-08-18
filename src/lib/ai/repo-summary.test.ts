import { describe, expect, it } from "vitest";
import { buildRepoSummaryPrompt } from "./repo-summary-prompt";

describe("buildRepoSummaryPrompt", () => {
  it("asks for summary, architecture, and features from README material", () => {
    const prompt = buildRepoSummaryPrompt({
      owner: "DiwanMalla",
      name: "devdocs-copilot",
      description: "Ask a GitHub repo questions.",
      readme: "# DevDocs Copilot\nGrounded chat over source.",
      packageDescription: "DevDocs Copilot",
      filePaths: ["README.md", "src/lib/chat/service.ts"],
    });

    expect(prompt).toContain("## Summary");
    expect(prompt).toContain("## Architecture");
    expect(prompt).toContain("## Features");
    expect(prompt).toContain("Grounded chat over source.");
    expect(prompt).toContain("src/lib/chat/service.ts");
  });
});
