export type SyntaxToken = {
  type: "text" | "comment" | "string" | "keyword" | "number";
  value: string;
};

const C_LIKE = new Set([
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "java",
  "kotlin",
  "go",
  "rust",
  "c",
  "c++",
  "c#",
  "swift",
  "php",
  "scala",
  "dart",
]);

const HASH_COMMENT = new Set([
  "python",
  "ruby",
  "shell",
  "bash",
  "yaml",
  "toml",
  "r",
  "elixir",
  "terraform",
  "prisma",
  "dotenv",
]);

const KEYWORDS: Record<string, readonly string[]> = {
  typescript: [
    "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "enum", "export", "extends", "false",
    "finally", "for", "from", "function", "if", "implements", "import", "in",
    "instanceof", "interface", "let", "new", "null", "of", "private",
    "protected", "public", "return", "static", "super", "switch", "this",
    "throw", "true", "try", "type", "typeof", "undefined", "var", "void",
    "while", "with", "async", "await", "as", "satisfies",
  ],
  python: [
    "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "False", "finally", "for", "from",
    "global", "if", "import", "in", "is", "lambda", "None", "not", "or",
    "pass", "raise", "return", "True", "try", "while", "with", "yield",
  ],
  sql: [
    "select", "from", "where", "insert", "update", "delete", "join", "left",
    "right", "inner", "outer", "on", "and", "or", "not", "null", "as",
    "create", "table", "index", "into", "values", "set", "limit", "order",
    "by", "group", "having", "with", "return",
  ],
  go: [
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
    "map", "package", "range", "return", "select", "struct", "switch", "type",
    "var", "true", "false", "nil",
  ],
  rust: [
    "as", "async", "await", "break", "const", "continue", "crate", "dyn",
    "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let",
    "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self",
    "Self", "static", "struct", "super", "trait", "true", "type", "unsafe",
    "use", "where", "while",
  ],
};

KEYWORDS.javascript = KEYWORDS.typescript;
KEYWORDS.tsx = KEYWORDS.typescript;
KEYWORDS.jsx = KEYWORDS.typescript;
KEYWORDS.java = KEYWORDS.typescript;

function normalizeLanguage(language: string | null): string {
  return (language ?? "").trim().toLowerCase();
}

function keywordsFor(language: string): ReadonlySet<string> {
  if (language.includes("python")) return new Set(KEYWORDS.python);
  if (language.includes("sql")) return new Set(KEYWORDS.sql);
  if (language.includes("go")) return new Set(KEYWORDS.go);
  if (language.includes("rust")) return new Set(KEYWORDS.rust);
  if (
    language.includes("type") ||
    language.includes("java") ||
    language.includes("script")
  ) {
    return new Set(KEYWORDS.typescript);
  }
  return new Set(KEYWORDS.typescript);
}

function isCLike(language: string): boolean {
  return [...C_LIKE].some((name) => language.includes(name));
}

function usesHashComments(language: string): boolean {
  return [...HASH_COMMENT].some((name) => language.includes(name));
}

function tokenizeLine(
  line: string,
  language: string,
  inBlockComment: boolean,
): { tokens: SyntaxToken[]; inBlockComment: boolean } {
  const tokens: SyntaxToken[] = [];
  const keywords = keywordsFor(language);
  const cLike = isCLike(language) || language.length === 0;
  const hashComments = usesHashComments(language);
  let i = 0;
  let block = inBlockComment;

  const push = (type: SyntaxToken["type"], value: string) => {
    if (value.length === 0) {
      return;
    }
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) {
      last.value += value;
      return;
    }
    tokens.push({ type, value });
  };

  while (i < line.length) {
    if (block) {
      const end = line.indexOf("*/", i);
      if (end === -1) {
        push("comment", line.slice(i));
        return { tokens, inBlockComment: true };
      }
      push("comment", line.slice(i, end + 2));
      block = false;
      i = end + 2;
      continue;
    }

    const rest = line.slice(i);

    if (cLike && rest.startsWith("/*")) {
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        push("comment", rest);
        return { tokens, inBlockComment: true };
      }
      push("comment", line.slice(i, end + 2));
      i = end + 2;
      continue;
    }

    if (cLike && rest.startsWith("//")) {
      push("comment", rest);
      break;
    }

    if (hashComments && rest.startsWith("#")) {
      push("comment", rest);
      break;
    }

    const quote = rest[0];
    if (quote === "'" || quote === "\"" || quote === "`") {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      push("string", rest.slice(0, j));
      i += j;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?/);
    if (number) {
      push("number", number[0]);
      i += number[0].length;
      continue;
    }

    const ident = rest.match(/^[A-Za-z_$][\w$]*/);
    if (ident) {
      push(keywords.has(ident[0]) ? "keyword" : "text", ident[0]);
      i += ident[0].length;
      continue;
    }

    push("text", rest[0] ?? "");
    i += 1;
  }

  return { tokens, inBlockComment: block };
}

export function tokenizeFile(
  content: string,
  language: string | null,
): SyntaxToken[][] {
  const lang = normalizeLanguage(language);
  let inBlockComment = false;
  return content.split("\n").map((line) => {
    const result = tokenizeLine(line.length === 0 ? " " : line, lang, inBlockComment);
    inBlockComment = result.inBlockComment;
    return result.tokens;
  });
}

export function tokenClassName(type: SyntaxToken["type"]): string | undefined {
  if (type === "comment") return "text-syntax-comment italic";
  if (type === "string") return "text-syntax-string";
  if (type === "keyword") return "text-syntax-keyword";
  if (type === "number") return "text-syntax-number";
  return undefined;
}
