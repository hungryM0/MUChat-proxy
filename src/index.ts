import { handleChatCompletions } from "./chat/handler";
import type { AppEnv } from "./env";
import { notFound, serverError, unauthorized } from "./shared/http";
import { TokenCache } from "./state/token-cache";

export { TokenCache };

export default {
  async fetch(request: Request, env: AppEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz" && request.method === "GET") {
      return new Response("ok");
    }

    if (url.pathname !== "/v1/chat/completions" || request.method !== "POST") {
      return notFound();
    }

    if (!isAuthorized(request, env.API_KEYS)) {
      return unauthorized();
    }

    try {
      return await handleChatCompletions(request, env);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "请求失败");
    }
  },
};

function isAuthorized(request: Request, apiKeysRaw: string): boolean {
  const authz = request.headers.get("Authorization")?.trim() ?? "";
  if (!authz.startsWith("Bearer ")) {
    return false;
  }
  const key = authz.slice("Bearer ".length).trim();
  return key === apiKeysRaw.trim();
}
