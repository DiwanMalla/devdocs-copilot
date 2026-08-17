import { describe, expect, it } from "vitest";
import { generateChatTitle } from "./title";

describe("generateChatTitle", () => {
  it("uses the first question as the thread title", () => {
    expect(generateChatTitle("How does validation work?")).toBe(
      "How does validation work",
    );
  });

  it("falls back for empty input and truncates long questions", () => {
    expect(generateChatTitle("   ")).toBe("New chat");
    expect(
      generateChatTitle(
        "Where is the very long implementation of the authentication helper actually stored in this repository?",
      ),
    ).toMatch(/…$/);
  });
});
