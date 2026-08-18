export function chatFallbackModels(
  fallbackModel = process.env.OPENROUTER_CHAT_FALLBACK_MODEL,
): string[] | undefined {
  const fallback = fallbackModel?.trim();
  return fallback ? [fallback] : undefined;
}

export function openRouterChatProviderOptions(
  fallbackModel = process.env.OPENROUTER_CHAT_FALLBACK_MODEL,
) {
  const models = chatFallbackModels(fallbackModel);

  return {
    reasoning: {
      effort: "minimal" as const,
      exclude: true,
    },
    provider: {
      allow_fallbacks: true,
    },
    ...(models ? { models } : {}),
  };
}
