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
      .mockImplementationOnce(async (input) => withResponseUrl(new Response(`
        <html><body>
        <form id="loginForm" action="/zfca/login">
          <input name="flowId" value="flow-123" />
        </form>
        <script>var ssoConfig = {"sm2":{"publicKey":"BMgXvoCLbC9cF8JAS/bv6Gd82+K+fFC2nRi7QJO3GvDkx0iLBmqDMpQUBxjC3yTfXN83cPVZRplPDsvr92K4omA="}};</script>
        </body></html>
      `, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }), String(input)))
      .mockImplementationOnce(async (input) => withResponseUrl(new Response("", {
        status: 302,
        headers: {
          location: "https://so.muc.edu.cn/ai_service/#/accessLogin?access_token=token123",
        },
      }), String(input)));

    await expect(fetchAccessToken("25040072", "secret")).resolves.toBe("token123");
    fetchMock.mockRestore();
  });

  it("follows the CAS redirect chain and carries login cookies", async () => {
    const requests: Array<{ url: string; method: string; cookie: string; body: string }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        cookie: headers.get("Cookie") ?? "",
        body: String(init?.body ?? ""),
      });

      if (requests.length === 1) {
        return withResponseUrl(new Response(`
          <html><body>
          <form id="loginForm">
            <input name="flowId" value="flow-123" />
            <input name="continue" value="go" />
          </form>
          <script>var ssoConfig = {"sm2":{"publicKey":"BMgXvoCLbC9cF8JAS/bv6Gd82+K+fFC2nRi7QJO3GvDkx0iLBmqDMpQUBxjC3yTfXN83cPVZRplPDsvr92K4omA="}};</script>
          </body></html>
        `, {
          status: 200,
          headers: {
            "Set-Cookie": "JSESSIONID=session-123; Path=/; HttpOnly",
          },
        }), String(input));
      }

      if (requests.length === 2) {
        return withResponseUrl(new Response("", {
          status: 302,
          headers: {
            location: "https://so.muc.edu.cn/ai_service/auth-center/account/mucCasLogin?ticket=ticket-123",
            "Set-Cookie": "SSO_TGC=tgc-123; Path=/; HttpOnly",
          },
        }), String(input));
      }

      return withResponseUrl(new Response("", {
        status: 302,
        headers: {
          location: "https://so.muc.edu.cn/ai_service/#/accessLogin?access_token=token123",
          "Set-Cookie": "SESSION=session-456; Path=/; HttpOnly",
        },
      }), String(input));
    });

    await expect(fetchAccessToken("25040072", "secret")).resolves.toBe("token123");

    expect(requests).toHaveLength(3);
    expect(requests[1].method).toBe("POST");
    expect(requests[1].cookie).toContain("JSESSIONID=session-123");
    expect(requests[1].body).toContain("username=25040072");
    expect(requests[1].body).toContain("loginType=username_password");
    expect(requests[1].body).toContain("flowId=flow-123");
    expect(requests[2].method).toBe("GET");
    expect(requests[2].url).toContain("mucCasLogin");
    expect(requests[2].cookie).not.toContain("JSESSIONID=session-123");
    fetchMock.mockRestore();
  });
});

function withResponseUrl(response: Response, url: string): Response {
  Object.defineProperty(response, "url", {
    value: url,
  });
  return response;
}
