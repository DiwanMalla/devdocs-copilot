export function isReadmePath(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return /^readme(\.[a-z0-9]+)?$/.test(base);
}

export function isPackageJsonPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "package.json" || lower.endsWith("/package.json");
}

export function isDocsPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "docs" || lower.startsWith("docs/");
}

export function isPrioritySourcePath(path: string): boolean {
  return isReadmePath(path) || isPackageJsonPath(path) || isDocsPath(path);
}

export function isAlwaysIndexPath(path: string): boolean {
  return isPrioritySourcePath(path);
}

export function priorityPathBoost(path: string): number {
  if (isReadmePath(path)) {
    return 0.28;
  }
  if (isDocsPath(path)) {
    return 0.18;
  }
  if (isPackageJsonPath(path)) {
    return 0.16;
  }
  return 0;
}

export function findReadmePath(paths: Iterable<string>): string | null {
  let fallback: string | null = null;
  for (const path of paths) {
    if (!isReadmePath(path)) {
      continue;
    }
    if (!path.includes("/")) {
      return path;
    }
    fallback ??= path;
  }
  return fallback;
}
