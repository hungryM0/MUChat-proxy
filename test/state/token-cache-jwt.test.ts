import { describe, expect, it } from "vitest";

function makeToken(exp: number): string {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

describe("jwt", () => {
  it("parses exp", () => {
    const token = makeToken(1_800_000_000);
    expect(parseJwtExp(token)).toBe(1_800_000_000_000);
  });

  it("checks freshness", () => {
    const now = 1_700_000_000_000;
    const fresh = makeToken(Math.floor((now + 2 * 60 * 60 * 1000) / 1000));
    const stale = makeToken(Math.floor((now + 10 * 60 * 1000) / 1000));
    expect(isTokenFresh(parseJwtExp(fresh), now)).toBe(true);
    expect(isTokenFresh(parseJwtExp(stale), now)).toBe(false);
  });
});

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isTokenFresh(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now + 60 * 60 * 1000;
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
