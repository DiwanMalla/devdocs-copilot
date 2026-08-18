import { handleChatRequest } from "@/lib/chat/service";
import { bootstrap } from "@/server/bootstrap";

bootstrap();

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request);
}
