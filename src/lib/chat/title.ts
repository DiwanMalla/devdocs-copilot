export function generateChatTitle(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "New chat";
  }

  const withoutPunctuation = cleaned.replace(/[?!.,:;]+$/g, "");
  if (withoutPunctuation.length <= 48) {
    return withoutPunctuation;
  }

  return `${withoutPunctuation.slice(0, 45).trimEnd()}…`;
}
