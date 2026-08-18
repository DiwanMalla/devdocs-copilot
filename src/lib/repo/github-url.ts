export function buildGitHubFileUrl(
  repoUrl: string,
  ref: string,
  path: string,
  lines: { start: number; end: number } | null,
): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const lineHash = lines ? `#L${lines.start}-L${lines.end}` : "";
  return `${repoUrl}/blob/${encodeURIComponent(ref)}/${encodedPath}${lineHash}`;
}
