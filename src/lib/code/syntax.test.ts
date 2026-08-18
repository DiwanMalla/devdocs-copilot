import { describe, expect, it } from "vitest";
import { tokenizeFile } from "./syntax";

describe("tokenizeFile", () => {
  it("highlights TypeScript keywords, strings, and comments", () => {
    const [line] = tokenizeFile(`const name = "devdocs"; // hi`, "TypeScript");
    expect(line?.some((token) => token.type === "keyword" && token.value === "const")).toBe(
      true,
    );
    expect(line?.some((token) => token.type === "string" && token.value.includes("devdocs"))).toBe(
      true,
    );
    expect(line?.some((token) => token.type === "comment")).toBe(true);
  });

  it("keeps plaintext readable when the language is unknown", () => {
    const [line] = tokenizeFile("hello world", "Text");
    expect(line?.map((token) => token.value).join("")).toBe("hello world");
  });
});
