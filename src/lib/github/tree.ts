import { MAX_FILES } from "./filters";

export class SnapshotIndexError extends Error {
  constructor(
    message: string,
    readonly code: "truncated" | "capped" | "empty",
  ) {
    super(message);
    this.name = "SnapshotIndexError";
  }
}

export function assertIndexableTree(input: {
  truncated: boolean;
  candidateCount: number;
}): void {
  if (input.truncated) {
    throw new SnapshotIndexError(
      "GitHub returned a truncated repository tree. This snapshot cannot be indexed safely.",
      "truncated",
    );
  }

  if (input.candidateCount > MAX_FILES) {
    throw new SnapshotIndexError(
      `Repository has ${input.candidateCount} ingestible files, which exceeds the ${MAX_FILES}-file snapshot limit.`,
      "capped",
    );
  }

  if (input.candidateCount === 0) {
    throw new SnapshotIndexError(
      "No ingestible source files found in this repository.",
      "empty",
    );
  }
}
