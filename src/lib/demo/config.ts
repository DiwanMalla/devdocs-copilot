export const DEMO_REPO_OWNER = "DiwanMalla";
export const DEMO_REPO_NAME = "devdocs-copilot";
export const DEMO_WORKSPACE_PATH = "/demo";
export const DEMO_REPO_INPUT = `${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`;
export const MIN_DEMO_FILE_COUNT = 8;
export const MIN_DEMO_CHUNK_COUNT = 8;

export function isDemoRepo(owner: string, name: string): boolean {
  return (
    owner.toLowerCase() === DEMO_REPO_OWNER.toLowerCase() &&
    name.toLowerCase() === DEMO_REPO_NAME.toLowerCase()
  );
}

export function isReadyDemoSnapshot(repo: {
  status: string;
  file_count: number;
  chunk_count: number;
  active_snapshot_id: string | null;
}): boolean {
  return (
    repo.status === "ready" &&
    Boolean(repo.active_snapshot_id) &&
    repo.file_count >= MIN_DEMO_FILE_COUNT &&
    repo.chunk_count >= MIN_DEMO_CHUNK_COUNT
  );
}
