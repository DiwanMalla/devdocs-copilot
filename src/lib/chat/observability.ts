type ChatLogFields = {
  event: string;
  correlationId: string;
  userId?: string;
  repoId?: string;
  chatId?: string;
  snapshotId?: string | null;
  durationMs?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export function chatLog(fields: ChatLogFields): void {
  console.info(
    JSON.stringify({
      source: "devdocs-chat",
      ...fields,
    }),
  );
}

export function chatError(
  fields: ChatLogFields & { error: string },
): void {
  console.error(
    JSON.stringify({
      source: "devdocs-chat",
      ...fields,
    }),
  );
}
