import type { ErrorBody } from "./types";

export function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function errorResponse(status: number, type: string, message: string): Response {
  const payload: ErrorBody = {
    error: {
      message,
      type,
    },
  };
  return jsonResponse(payload, { status });
}

export function notFound(): Response {
  return errorResponse(404, "not_found", "路径不存在");
}

export function unauthorized(): Response {
  return errorResponse(401, "invalid_api_key", "无效的 API Key");
}

export function badRequest(message: string): Response {
  return errorResponse(400, "invalid_request_error", message);
}

export function badGateway(message: string): Response {
  return errorResponse(502, "upstream_error", message);
}

export function serverError(message: string): Response {
  return errorResponse(500, "server_error", message);
}
