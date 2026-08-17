import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany } from "ai";

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

const EMBEDDING_BATCH_SIZE = 32;

function getEmbeddingModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Add it to .env.local before indexing repositories.",
    );
  }

  const openrouter = createOpenRouter({ apiKey });
  return openrouter.textEmbeddingModel(EMBEDDING_MODEL);
}

function assertEmbeddingDimensions(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, received ${embedding.length}.`,
    );
  }
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) {
    return [];
  }

  const model = getEmbeddingModel();
  const embeddings: number[][] = [];

  for (let offset = 0; offset < values.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const result = await embedMany({
      model,
      values: batch,
      maxParallelCalls: 2,
    });

    for (const embedding of result.embeddings) {
      assertEmbeddingDimensions(embedding);
      embeddings.push(embedding);
    }
  }

  return embeddings;
}

export async function embedQuery(value: string): Promise<number[]> {
  const result = await embed({
    model: getEmbeddingModel(),
    value,
  });
  assertEmbeddingDimensions(result.embedding);
  return result.embedding;
}
