import { describe, expect, it, vi } from "vitest";
import {
  extractAccessTokenFromText,
  extractRedirectFromBody,
  fetchAccessToken,
  parseLoginPageInfo,
  summarizeLoginFailure,
} from "../../src/auth/login";

describe("login parser", () => {
  it("parses flowId and public key", () => {
    const html = `
      <html><body>
      <form id="loginForm" action="/zfca/login">
        <input name="flowId" value="flow-123" />
        <input name="continue" value="go" />
      </form>
      <script>var ssoConfig = {"sm2":{"publicKey":"cHVibGljLWtleQ=="}};</script>
      </body></html>
    `;
    const info = parseLoginPageInfo(html, "https://ca.muc.edu.cn/zfca/login?service=abc");
    expect(info.flowId).toBe("flow-123");
    expect(info.publicKey).toBe("cHVibGljLWtleQ==");
    expect(info.formPostUrl).toBe("https://ca.muc.edu.cn/zfca/login");
    expect(info.formFields.continue).toBe("go");
  });

  it("extracts meta refresh redirect", () => {
    const html = `<meta http-equiv="refresh" content="0; url=/next/step" />`;
    expect(extractRedirectFromBody(html, "https://ca.muc.edu.cn/zfca/login")).toBe(
      "https://ca.muc.edu.cn/next/step",
    );
  });

  it("extracts js redirect", () => {
    const html =
      '<script>window.location.href="https://so.muc.edu.cn/ai_service/#/accessLogin?access_token=abc";</script>';
    expect(extractRedirectFromBody(html, "https://ca.muc.edu.cn/zfca/login")).toBe(
      "https://so.muc.edu.cn/ai_service/#/accessLogin?access_token=abc",
    );
  });

  it("extracts access token from text", () => {
    expect(extractAccessTokenFromText("some js access_token=token123&expires=1")).toBe("token123");
  });

  it("summarizes login failure", () => {
    const html = `<html><head><title>登录失败</title></head><body><div class="error">账号或密码错误</div></body></html>`;
    expect(summarizeLoginFailure(html)).toContain("账号或密码错误");
  });

  it("accepts current login page sm2 public key format", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(`
        <html><body>
        <form id="loginForm" action="/zfca/login">
          <input name="flowId" value="flow-123" />
        </form>
        <script>var ssoConfig = {"sm2":{"publicKey":"BMgXvoCLbC9cF8JAS/bv6Gd82+K+fFC2nRi7QJO3GvDkx0iLBmqDMpQUBxjC3yTfXN83cPVZRplPDsvr92K4omA="}};</script>
        </body></html>
      `, { status: 200 }))
      .mockResolvedValueOnce(new Response("", {
        status: 302,
        headers: {
          location: "https://so.muc.edu.cn/ai_service/#/accessLogin?access_token=token123",
        },
      }));

    await expect(fetchAccessToken("25040072", "secret")).resolves.toBe("token123");
    fetchMock.mockRestore();
  });
});
