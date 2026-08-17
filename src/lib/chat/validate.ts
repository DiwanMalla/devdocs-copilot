import { ChatRequestError } from "./errors";
import { MAX_QUESTION_CHARACTERS } from "./limits";

export function validateQuestion(question: string): string {
  const normalized = question.trim();
  if (!normalized || normalized.length > MAX_QUESTION_CHARACTERS) {
    throw new ChatRequestError(
      `Questions must be between 1 and ${MAX_QUESTION_CHARACTERS} characters.`,
    );
  }
  return normalized;
}
