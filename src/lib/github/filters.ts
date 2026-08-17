export const MAX_FILE_BYTES = 200 * 1024;
export const MAX_FILES = 250;

const SKIP_DIR_NAMES = new Set([
  ".cache",
  ".git",
  ".idea",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".venv",
  ".vscode",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "pods",
  "target",
  "vendor",
  "venv",
]);

const SKIP_FILENAMES = new Set([
  ".ds_store",
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
]);

const SKIP_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lock",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".rar",
  ".so",
  ".svg",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

export function shouldSkipPath(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => SKIP_DIR_NAMES.has(part.toLowerCase()))) {
    return true;
  }

  const filename = parts.at(-1)?.toLowerCase() ?? "";
  if (!filename || SKIP_FILENAMES.has(filename)) {
    return true;
  }

  const dot = filename.lastIndexOf(".");
  if (dot > 0) {
    const ext = filename.slice(dot);
    if (SKIP_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

export function isLikelyBinaryContent(content: string): boolean {
  return content.includes("\u0000");
}
