import { describe, expect, it } from "vitest";
import { buildGitHubFileUrl } from "./github-url";
import { buildRepoWorkspaceHref } from "./href";
import { parseLineRange } from "./line-range";

describe("parseLineRange", () => {
  it("parses valid ranges used by citation navigation", () => {
    expect(parseLineRange("12-18")).toEqual({ start: 12, end: 18 });
  });

  it("rejects inverted, oversized, or malformed ranges", () => {
    expect(parseLineRange("18-12")).toBeNull();
    expect(parseLineRange("1-1000")).toBeNull();
    expect(parseLineRange("L12-L18")).toBeNull();
    expect(parseLineRange(12)).toBeNull();
  });
});

describe("buildRepoWorkspaceHref", () => {
  it("keeps the active chat while opening a cited file range", () => {
    expect(
      buildRepoWorkspaceHref({
        owner: "sindresorhus",
        name: "is",
        path: "source/index.ts",
        lines: { start: 10, end: 14 },
        chatId: "chat-1",
      }),
    ).toBe(
      "/repos/sindresorhus/is?path=source%2Findex.ts&lines=10-14&chat=chat-1#L10",
    );
  });

  it("preserves chat, search, and snapshot when opening another file", () => {
    expect(
      buildRepoWorkspaceHref({
        owner: "sindresorhus",
        name: "is",
        path: "readme.md",
        chatId: "chat-1",
        query: "type guard",
        snapshotId: "snap-1",
      }),
    ).toBe(
      "/repos/sindresorhus/is?path=readme.md&chat=chat-1&q=type+guard&snapshot=snap-1",
    );
  });

  it("keeps demo citations on the public /demo workspace", () => {
    expect(
      buildRepoWorkspaceHref({
        owner: "vercel",
        name: "next.js",
        path: "packages/next/index.js",
        lines: { start: 4, end: 12 },
        basePath: "/demo",
      }),
    ).toBe("/demo?path=packages%2Fnext%2Findex.js&lines=4-12#L4");
  });
});

describe("buildGitHubFileUrl", () => {
  it("encodes the blob path and line hash", () => {
    expect(
      buildGitHubFileUrl(
        "https://github.com/expressjs/express",
        "abc123",
        "lib/router/index.js",
        { start: 10, end: 18 },
      ),
    ).toBe(
      "https://github.com/expressjs/express/blob/abc123/lib/router/index.js#L10-L18",
    );
  });
});
