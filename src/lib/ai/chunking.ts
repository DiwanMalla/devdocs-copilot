export const MAX_CHUNK_CHARACTERS = 6_000;
export const MAX_CHUNK_LINES = 80;
export const CHUNK_OVERLAP_LINES = 10;

export type SourceChunk = {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
};

function splitLongLine(line: string): string[] {
  if (line.length <= MAX_CHUNK_CHARACTERS) {
    return [line];
  }

  const segments: string[] = [];
  for (let offset = 0; offset < line.length; offset += MAX_CHUNK_CHARACTERS) {
    segments.push(line.slice(offset, offset + MAX_CHUNK_CHARACTERS));
  }
  return segments;
}

export function chunkSource(content: string): SourceChunk[] {
  const lines = content.split("\n");
  const chunks: SourceChunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const firstLine = lines[start] ?? "";

    if (firstLine.length > MAX_CHUNK_CHARACTERS) {
      for (const segment of splitLongLine(firstLine)) {
        chunks.push({
          chunkIndex: chunks.length,
          startLine: start + 1,
          endLine: start + 1,
          content: segment,
        });
      }
      start += 1;
      continue;
    }

    let end = start;
    let characterCount = 0;

    while (end < lines.length && end - start < MAX_CHUNK_LINES) {
      const line = lines[end] ?? "";
      const addedCharacters = line.length + (end > start ? 1 : 0);

      if (
        end > start &&
        characterCount + addedCharacters > MAX_CHUNK_CHARACTERS
      ) {
        break;
      }

      characterCount += addedCharacters;
      end += 1;
    }

    const chunkContent = lines.slice(start, end).join("\n");
    if (chunkContent.trim()) {
      chunks.push({
        chunkIndex: chunks.length,
        startLine: start + 1,
        endLine: end,
        content: chunkContent,
      });
    }

    if (end >= lines.length) {
      break;
    }

    start = Math.max(start + 1, end - CHUNK_OVERLAP_LINES);
  }

  return chunks;
}
