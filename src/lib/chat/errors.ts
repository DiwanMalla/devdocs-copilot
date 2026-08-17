export type ChatErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "not_ready"
  | "in_progress"
  | "cancelled"
  | "provider_failed"
  | "no_evidence";

export class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code: ChatErrorCode = "invalid_request",
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}
