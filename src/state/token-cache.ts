import { DurableObject } from "cloudflare:workers";
import { fetchAccessToken } from "../auth/login";
import type { AppEnv } from "../env";
import { TOKEN_REFRESH_WINDOW_MS } from "../shared/constants";
import type { TokenRecord } from "../shared/types";

export class TokenCache extends DurableObject<AppEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "DELETE" && url.pathname === "/token") {
      await this.ctx.storage.delete("token");
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST" || url.pathname !== "/token") {
      return new Response("Not found", { status: 404 });
    }

    const force = url.searchParams.get("force") === "1";
    const injectedToken = request.headers.get("x-test-token");
    const record = await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const cached = await this.ctx.storage.get<TokenRecord>("token");
      if (!force && cached && isTokenFresh(cached.expiresAt, now)) {
        return cached;
      }

      const token = injectedToken ?? (await fetchAccessToken(this.env.MUC_USERNAME, this.env.MUC_PASSWORD));
      const next = {
        token,
        expiresAt: safeParseJwtExp(token),
      };
      await this.ctx.storage.put("token", next);
      return next;
    });

    return Response.json(record);
  }
}

export async function getAccessToken(env: AppEnv): Promise<string> {
  const stub = env.TOKEN_CACHE.getByName("default");
  const response = await stub.fetch("https://token-cache/token", { method: "POST" });
  if (!response.ok) {
    throw new Error(`获取 access token 失败: ${response.status}`);
  }
  const record = (await response.json()) as { token: string };
  return record.token;
}

function safeParseJwtExp(token: string): number {
  try {
    return parseJwtExp(token);
  } catch {
    return 0;
  }
}

function isTokenFresh(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now + TOKEN_REFRESH_WINDOW_MS;
}

function parseJwtExp(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("token 不是合法 JWT");
  }
  const payload = JSON.parse(decodeBase64Url(parts[1])) as { exp?: number };
  if (!payload.exp) {
    throw new Error("JWT 缺少 exp");
  }
  return payload.exp * 1000;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
