export type WorkspaceQuery = {
  path?: string | null;
  lines?: { start: number; end: number } | null;
  chatId?: string | null;
  query?: string | null;
  snapshotId?: string | null;
};

export function buildRepoWorkspaceHref({
  owner,
  name,
  path,
  lines,
  chatId,
  query,
  snapshotId,
}: {
  owner: string;
  name: string;
} & WorkspaceQuery): string {
  const params = new URLSearchParams();
  if (path) {
    params.set("path", path);
  }
  if (lines) {
    params.set("lines", `${lines.start}-${lines.end}`);
  }
  if (chatId) {
    params.set("chat", chatId);
  }
  if (query) {
    params.set("q", query);
  }
  if (snapshotId) {
    params.set("snapshot", snapshotId);
  }

  const search = params.toString();
  const hash = lines ? `#L${lines.start}` : "";
  return (
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
    (search ? `?${search}` : "") +
    hash
  );
}
