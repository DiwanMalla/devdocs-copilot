const MAX_SUMMARY_SOURCE_CHARS = 12_000;
const MAX_FILE_LIST = 80;

export function buildRepoSummaryPrompt(input: {
  owner: string;
  name: string;
  description: string | null;
  readme: string | null;
  packageDescription: string | null;
  filePaths: string[];
}): string {
  const files = input.filePaths.slice(0, MAX_FILE_LIST).join("\n");
  const readme = (input.readme ?? "").slice(0, MAX_SUMMARY_SOURCE_CHARS);

  return `Generate a factual summary of the GitHub repository ${input.owner}/${input.name} using ONLY the material below.

Write Markdown with exactly these headings:
## Summary
## Architecture
## Features

Rules:
- Do not invent files, libraries, or behavior that are not supported by the material.
- Keep the whole answer under 400 words.
- Use short bullets in Architecture and Features.

GitHub description:
${input.description?.trim() || "(none)"}

package.json description:
${input.packageDescription?.trim() || "(none)"}

Tracked files:
${files || "(none)"}

README:
${readme || "(none)"}`;
}
