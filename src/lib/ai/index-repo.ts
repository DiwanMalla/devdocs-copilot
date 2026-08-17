import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chunkSource } from "./chunking";
import { embedTexts } from "./embeddings";

const CHUNK_INSERT_BATCH_SIZE = 40;

export type IndexableFile = {
  id: string;
  path: string;
  content: string;
};

type PendingChunk = {
  repo_id: string;
  file_id: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  embeddingText: string;
};

export async function indexRepoFiles(
  repoId: string,
  files: IndexableFile[],
): Promise<number> {
  const admin = createAdminClient();
  const pendingChunks: PendingChunk[] = files.flatMap((file) =>
    chunkSource(file.content).map((chunk) => ({
      repo_id: repoId,
      file_id: file.id,
      chunk_index: chunk.chunkIndex,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      content: chunk.content,
      embeddingText: `${file.path}\n${chunk.content}`,
    })),
  );

  if (pendingChunks.length === 0) {
    throw new Error("No source chunks were produced for this repository.");
  }

  const embeddings = await embedTexts(
    pendingChunks.map((chunk) => chunk.embeddingText),
  );

  if (embeddings.length !== pendingChunks.length) {
    throw new Error("The embedding provider returned an incomplete result.");
  }

  for (
    let offset = 0;
    offset < pendingChunks.length;
    offset += CHUNK_INSERT_BATCH_SIZE
  ) {
    const batch = pendingChunks
      .slice(offset, offset + CHUNK_INSERT_BATCH_SIZE)
      .map((chunk, index) => ({
        repo_id: chunk.repo_id,
        file_id: chunk.file_id,
        chunk_index: chunk.chunk_index,
        start_line: chunk.start_line,
        end_line: chunk.end_line,
        content: chunk.content,
        embedding: embeddings[offset + index],
      }));

    const { error } = await admin.from("chunks").insert(batch);
    if (error) {
      throw new Error(`Failed to store source chunks: ${error.message}`);
    }
  }

  return pendingChunks.length;
}
