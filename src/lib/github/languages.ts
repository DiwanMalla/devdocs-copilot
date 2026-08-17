const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".json": "JSON",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".html": "HTML",
  ".htm": "HTML",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".dockerfile": "Dockerfile",
  ".env": "Dotenv",
  ".txt": "Text",
  ".r": "R",
  ".dart": "Dart",
  ".lua": "Lua",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hs": "Haskell",
  ".scala": "Scala",
  ".tf": "Terraform",
  ".prisma": "Prisma",
};

export function languageFromPath(path: string): string | null {
  const filename = path.split("/").pop()?.toLowerCase() ?? "";
  if (filename === "dockerfile" || filename === "makefile") {
    return filename === "dockerfile" ? "Dockerfile" : "Makefile";
  }

  const dot = filename.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }

  const ext = filename.slice(dot);
  return LANGUAGE_BY_EXTENSION[ext] ?? null;
}
