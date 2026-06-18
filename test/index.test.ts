import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import worker from "../src";

const token = makeToken(Math.floor((Date.now() + 2 * 60 * 60 * 1000) / 1000));
type MockResponseSpec = {
  status: number;
  headers?: HeadersInit;
  body?: string;
};

describe("worker entry", () => {
  beforeEach(async () => {
    const stub = (env as AppEnv).TOKEN_CACHE.getByName("default");
    await stub.fetch("https://token-cache/token", { method: "DELETE" });
  });

  it("returns healthz", async () => {
    const response = await dispatch("https://example.com/healthz");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("rejects missing api key", async () => {
    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        message: "无效的 API Key",
        type: "invalid_api_key",
      },
    });
  });

  it("does not split comma-separated api keys", async () => {
    const localEnv = {
      ...(env as AppEnv),
      API_KEYS: "sk-demo-key,sk-other-key",
    };
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("https://example.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk-demo-key",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      localEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it("returns not found for unknown path", async () => {
    const response = await dispatch("https://example.com/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        message: "路径不存在",
        type: "not_found",
      },
    });
  });

  it("returns non-stream chat response", async () => {
    await seedToken();
    const mock = mockFetchSequence([
      upstreamResponse([
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"content":"he"}}]}\n\n',
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"content":"llo"}}]}\n\n',
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
    ]);

    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-demo-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v3-minda",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    expect(payload.choices[0].message.content).toBe("hello");
    mock.mockRestore();
  });

  it("returns stream response", async () => {
    await seedToken();
    const mock = mockFetchSequence([
      upstreamResponse([
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"content":"he"}}]}\n\n',
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"content":"llo"}}]}\n\n',
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
    ]);

    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-demo-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-r1-minda",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const text = await response.text();
    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain('"role":"assistant"');
    expect(text).toContain('"content":"he"');
    expect(text).toContain('"content":"llo"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("data: [DONE]");
    mock.mockRestore();
  });

  it("ignores reasoning chunks in non-stream mode", async () => {
    await seedToken();
    const mock = mockFetchSequence([
      upstreamResponse([
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"reasoning_content":"想"}}]}\n\n',
        "event: answer\n",
        'data: {"id":"1","choices":[{"delta":{"content":"答案"}}]}\n\n',
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
    ]);

    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-demo-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-r1-minda",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    expect(payload.choices[0].message.content).toBe("答案");
    mock.mockRestore();
  });

  it("ignores answer event with done marker", async () => {
    await seedToken();
    const mock = mockFetchSequence([
      upstreamResponse([
        "event: answer\n",
        "data: [DONE]\n\n",
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
    ]);

    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-demo-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v3-minda",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    mock.mockRestore();
  });

  it("uses durable object token cache to avoid relogin", async () => {
    await seedToken();
    const mock = mockFetchSequence([
      upstreamResponse([
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
      upstreamResponse([
        "event: flowResponses\n",
        "data: [DONE]\n\n",
      ]),
    ]);

    const req = () =>
      dispatch("https://example.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk-demo-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-v3-minda",
          messages: [{ role: "user", content: "hello" }],
          stream: false,
        }),
      });

    const first = await req();
    const second = await req();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mock.mock.calls).toHaveLength(2);
    mock.mockRestore();
  });

  it("rejects bad model", async () => {
    const response = await dispatch("https://example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-demo-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "bad-model",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        message: "不支持的模型: bad-model",
        type: "invalid_request_error",
      },
    });
  });
});

function upstreamResponse(lines: string[]): MockResponseSpec {
  return responseSpec(200, lines.join(""), {
    "Chat-Question-Id": "chat-1_1",
  });
}

function mockFetchSequence(responses: MockResponseSpec[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const next = responses.shift();
    if (!next) {
      throw new Error(`unexpected fetch: ${String(input)}`);
    }
    return new Response(next.body ?? "", {
      status: next.status,
      headers: next.headers,
    });
  });
}

async function dispatch(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(input, init), env as AppEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function seedToken(): Promise<void> {
  const stub = (env as AppEnv).TOKEN_CACHE.getByName("default");
  await stub.fetch("https://token-cache/token", {
    method: "POST",
    headers: {
      "x-test-token": token,
    },
  });
}

function makeToken(exp: number): string {
  return `${toBase64Url('{"alg":"none","typ":"JWT"}')}.${toBase64Url(JSON.stringify({ exp }))}.sig`;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function responseSpec(status: number, body = "", headers?: HeadersInit): MockResponseSpec {
  return { status, body, headers };
}
