import { describe, expect, it } from "vitest";
import { MAX_QUESTION_CHARACTERS } from "./limits";
import { ChatRequestError } from "./errors";
import { validateQuestion } from "./validate";

describe("chat request validation", () => {
  it("shares one question length budget", () => {
    expect(MAX_QUESTION_CHARACTERS).toBe(2_000);
    expect(validateQuestion("Where is auth handled?")).toBe(
      "Where is auth handled?",
    );
  });

  it("rejects oversized questions with a 400", () => {
    expect(() => validateQuestion("a".repeat(MAX_QUESTION_CHARACTERS + 1))).toThrow(
      ChatRequestError,
    );
    try {
      validateQuestion("a".repeat(2_001));
    } catch (error) {
      expect(error).toBeInstanceOf(ChatRequestError);
      expect((error as ChatRequestError).status).toBe(400);
    }
  });

  it("maps idempotent in-progress collisions to 409", () => {
    const error = new ChatRequestError(
      "This question is already being generated.",
      409,
      "in_progress",
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe("in_progress");
  });
});
