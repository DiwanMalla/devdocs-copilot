import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const CHAT_MODEL = "openai/gpt-oss-20b:free";

export {
  buildGroundedSystemPrompt,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  normalizeAnswerCitations,
} from "./grounding";

export function getChatModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Add it to .env.local before using chat.",
    );
  }

  return createOpenRouter({ apiKey })(CHAT_MODEL);
}
