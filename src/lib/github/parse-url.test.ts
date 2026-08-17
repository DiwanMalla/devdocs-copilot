import { describe, expect, it } from "vitest";
import { parseGitHubRepoInput } from "./parse-url";

describe("parseGitHubRepoInput", () => {
  it("parses https GitHub URLs", () => {
    expect(parseGitHubRepoInput("https://github.com/sindresorhus/is")).toEqual({
      owner: "sindresorhus",
      name: "is",
    });
  });

  it("parses owner/name and strips .git", () => {
    expect(parseGitHubRepoInput("vercel/next.js.git")).toEqual({
      owner: "vercel",
      name: "next.js",
    });
  });

  it("rejects empty and invalid input", () => {
    expect(() => parseGitHubRepoInput("")).toThrow(/Enter a public GitHub/);
    expect(() => parseGitHubRepoInput("not-a-repo")).toThrow(/Could not parse/);
    expect(() => parseGitHubRepoInput("../etc/passwd")).toThrow(/Could not parse/);
  });
});
