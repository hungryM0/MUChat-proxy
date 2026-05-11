import { sm2 } from "sm-crypto";
import {
  CLIENT_ID,
  LOGIN_URL,
  USER_AGENT,
} from "../shared/constants";
import type { LoginPageInfo } from "../shared/types";
import { createCookieJar } from "./cookies";

const META_REFRESH_PATTERN = /\burl\s*=\s*([^;]+)$/i;
const BODY_READ_LIMIT = 2 << 20;
const ERROR_TEXT_LIMIT = 200;
const JS_REDIRECT_PATTERNS = [
  /(?:window|top|self|parent)?\.?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
  /location\.(?:assign|replace)\(\s*["']([^"']+)["']\s*\)/i,
];
const MAX_REDIRECT_HOPS = 6;

export async function fetchAccessToken(username: string, password: string): Promise<string> {
  const jar = createCookieJar();
  const loginPage = await fetchLoginPageInfo(jar);
  const encryptedPassword = encryptPassword(password, loginPage.publicKey);
  let [location, token] = await submitLogin(jar, username, encryptedPassword, loginPage);

  if (token) {
    return token;
  }

  for (let step = 0; step < MAX_REDIRECT_HOPS; step += 1) {
    if (location) {
      const directToken = tryExtractAccessToken(location);
      if (directToken) {
        return directToken;
      }
      [location, token] = await followRedirect(jar, location);
      if (token) {
        return token;
      }
    }
  }

  throw new Error(`登录跳转超过上限，最后地址: ${location ?? "-"}`);
}

export function parseLoginPageInfo(html: string, pageUrl?: string): LoginPageInfo {
  const formMarkup = readLoginForm(html);
  const inputs = readInputTags(formMarkup || html);
  const flowId = inputs.find((input) => input.name === "flowId")?.value ?? "";
  if (!flowId) {
    throw new Error("登录页缺少 flowId");
  }

  const publicKey = readPublicKey(html);
  if (!publicKey) {
    throw new Error("登录页缺少 SM2 公钥");
  }

  const formFields = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
  const action = readFormAction(formMarkup);

  return {
    flowId,
    publicKey,
    formFields,
    formPostUrl: resolveLocation(pageUrl, action),
  };
}

export function extractRedirectFromBody(body: string, baseUrl?: string): string {
  const metaMatches = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?([^"'>]+)["']?[^>]*>/i);
  if (metaMatches) {
    const refresh = metaMatches[1].trim();
    const parts = META_REFRESH_PATTERN.exec(refresh);
    if (parts?.[1]) {
      return resolveLocation(baseUrl, parts[1].trim().replace(/^["']|["']$/g, ""));
    }
  }

  for (const pattern of JS_REDIRECT_PATTERNS) {
    const matches = pattern.exec(body);
    if (matches?.[1]) {
      return resolveLocation(baseUrl, matches[1].trim());
    }
  }
  return "";
}

export function extractAccessTokenFromText(text: string): string {
  return (
    findQueryParam(text, "/accessLogin?access_token") ||
    findQueryParam(text, "access_token") ||
    ""
  );
}

export function summarizeLoginFailure(body: string): string {
  const candidates = [
    readTagText(body, /<div[^>]+id=["']msg["'][^>]*>([\s\S]*?)<\/div>/i),
    readTagText(body, /<div[^>]+class=["'][^"']*\bmsg\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    readTagText(body, /<div[^>]+class=["'][^"']*\berror\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    readTagText(body, /<div[^>]+class=["'][^"']*\berrorMessage\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    readTagText(body, /<div[^>]+class=["'][^"']*\bel-message__content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    readTagText(body, /<title>([\s\S]*?)<\/title>/i),
  ].filter(Boolean);

  if (candidates.length > 0) {
    return clipText(candidates[0], ERROR_TEXT_LIMIT);
  }

  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain ? clipText(plain, ERROR_TEXT_LIMIT) : "页面为空";
}

function encryptPassword(password: string, publicKey: string): string {
  const keyBytes = decodeBase64(publicKey);
  const hex = bytesToHex(keyBytes);
  const normalized = hex.startsWith("04") ? hex : `04${hex}`;
  const encrypted = sm2.doEncrypt(password, normalized, 1);
  return encodeBase64(hexToBytes(encrypted));
}

async function fetchLoginPageInfo(jar: ReturnType<typeof createCookieJar>): Promise<LoginPageInfo> {
  const response = await workerFetch(LOGIN_URL, {
    method: "GET",
    headers: defaultHeaders(),
    redirect: "manual",
  }, jar);
  if (response.status !== 200) {
    throw new Error(`登录页状态码异常: ${response.status}`);
  }
  return parseLoginPageInfo(await response.text(), response.url);
}

async function submitLogin(
  jar: ReturnType<typeof createCookieJar>,
  username: string,
  encryptedPassword: string,
  info: LoginPageInfo,
): Promise<[string, string]> {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(info.formFields)) {
    values.set(key, value);
  }
  values.set("username", username);
  values.set("password", encryptedPassword);
  values.set("submit", "登录");
  values.set("loginType", "username_password");
  values.set("flowId", info.flowId);

  const response = await workerFetch(
    info.formPostUrl || LOGIN_URL,
    {
      method: "POST",
      headers: {
        ...defaultHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://ca.muc.edu.cn",
        Referer: LOGIN_URL,
      },
      body: values.toString(),
      redirect: "manual",
    },
    jar,
  );

  const location = resolveLocation(response.url, response.headers.get("location"));
  if (location) {
    return [location, ""];
  }
  const body = await limitedText(response);
  const redirect = extractRedirectFromBody(body, response.url);
  if (redirect) {
    return [redirect, ""];
  }
  const token = extractAccessTokenFromText(body);
  if (token) {
    return ["", token];
  }
  throw new Error(`登录提交未拿到跳转地址，状态码: ${response.status}，页面提示: ${summarizeLoginFailure(body)}`);
}

async function followRedirect(
  jar: ReturnType<typeof createCookieJar>,
  location: string,
): Promise<[string, string]> {
  const directToken = tryExtractAccessToken(location);
  if (directToken) {
    return ["", directToken];
  }

  const response = await workerFetch(location, {
    method: "GET",
    headers: defaultHeaders(),
    redirect: "manual",
  }, jar);

  const next = resolveLocation(response.url, response.headers.get("location"));
  if (next) {
    return [next, ""];
  }
  const body = await limitedText(response);
  const redirect = extractRedirectFromBody(body, response.url);
  if (redirect) {
    return [redirect, ""];
  }
  const token = extractAccessTokenFromText(body);
  if (token) {
    return ["", token];
  }
  throw new Error(`跳转后未拿到下一跳，状态码: ${response.status}，当前地址: ${location}，页面提示: ${summarizeLoginFailure(body)}`);
}

async function workerFetch(
  input: string,
  init: RequestInit,
  jar: ReturnType<typeof createCookieJar>,
): Promise<Response> {
  const url = new URL(input);
  const headers = new Headers(init.headers);
  const cookie = jar.header(url);
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const response = await fetch(url.toString(), { ...init, headers });
  jar.store(url, response);
  return response;
}

async function limitedText(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    return "";
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < BODY_READ_LIMIT) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      chunks.push(value);
    }
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

function defaultHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "User-Agent": USER_AGENT,
    "Accept-Language": "zh-CN,zh;q=0.9",
    Clientid: CLIENT_ID,
  };
}

function readPublicKey(html: string): string {
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    const script = match[1];
    const config = script.match(/var\s+ssoConfig\s*=\s*([^;]+);?/);
    if (!config?.[1]) {
      continue;
    }
    try {
      const parsed = JSON.parse(config[1].trim()) as { sm2?: { publicKey?: string } };
      if (parsed.sm2?.publicKey) {
        return parsed.sm2.publicKey;
      }
    } catch {
      continue;
    }
  }
  return "";
}

function readLoginForm(html: string): string {
  return html.match(/<form[^>]+id=["']loginForm["'][^>]*>[\s\S]*?<\/form>/i)?.[0] ?? "";
}

function readFormAction(formHtml: string): string {
  return formHtml.match(/action=["']([^"']+)["']/i)?.[1] ?? "";
}

function readInputTags(html: string): Array<{ name: string; value: string }> {
  const results: Array<{ name: string; value: string }> = [];
  const matches = html.matchAll(/<input\b([^>]*)>/gi);
  for (const match of matches) {
    const attributes = match[1];
    const name = readAttribute(attributes, "name").trim();
    if (!name) {
      continue;
    }
    results.push({
      name,
      value: readAttribute(attributes, "value"),
    });
  }
  return results;
}

function readAttribute(attributes: string, name: string): string {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "i");
  return pattern.exec(attributes)?.[1] ?? "";
}

function resolveLocation(baseUrl: string | undefined, raw: string | null): string {
  const location = raw?.trim();
  if (!location) {
    return "";
  }
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
}

function tryExtractAccessToken(location: string): string {
  try {
    const url = new URL(location);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    return fragment.get("/accessLogin?access_token") || fragment.get("access_token") || "";
  } catch {
    return "";
  }
}

function findQueryParam(raw: string, key: string): string {
  const index = raw.indexOf(`${key}=`);
  if (index < 0) {
    return "";
  }
  const slice = raw.slice(index);
  const match = slice.match(new RegExp(`^${escapeRegExp(key)}=([^&"'\\s<>]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function readTagText(html: string, pattern: RegExp): string {
  return pattern.exec(html)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function clipText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  const parts = value.match(/.{1,2}/g) ?? [];
  return Uint8Array.from(parts, (part) => Number.parseInt(part, 16));
}
