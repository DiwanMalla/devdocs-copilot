import { handleChatRequest } from "@/lib/chat/service";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request);
}
