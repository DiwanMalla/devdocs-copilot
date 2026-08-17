export type LineRange = {
  start: number;
  end: number;
};

export function parseLineRange(value: unknown): LineRange | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1] ?? "", 10);
  const end = Number.parseInt(match[2] ?? "", 10);
  if (start < 1 || end < start || end - start > 500) {
    return null;
  }

  return { start, end };
}
