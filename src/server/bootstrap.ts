import "server-only";

import { validateAppEnv } from "@/lib/env";

export function bootstrap(): void {
  validateAppEnv();
}
