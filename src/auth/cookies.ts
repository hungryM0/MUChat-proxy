export interface CookieJar {
  header(url: URL): string;
  store(url: URL, response: Response): void;
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

export function createCookieJar(): CookieJar {
  const cookies = new Map<string, StoredCookie>();

  return {
    header(url) {
      const values: string[] = [];
      for (const cookie of cookies.values()) {
        if (!domainMatches(url.hostname, cookie.domain)) {
          continue;
        }
        if (!url.pathname.startsWith(cookie.path)) {
          continue;
        }
        if (cookie.secure && url.protocol !== "https:") {
          continue;
        }
        values.push(`${cookie.name}=${cookie.value}`);
      }
      return values.join("; ");
    },
    store(url, response) {
      const values = getSetCookieValues(response.headers);
      for (const value of values) {
        const parsed = parseSetCookie(value, url);
        cookies.set(`${parsed.domain}|${parsed.path}|${parsed.name}`, parsed);
      }
    },
  };
}

function getSetCookieValues(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[]; getAll?: (name: string) => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }
  if (typeof withGetSetCookie.getAll === "function") {
    return withGetSetCookie.getAll("Set-Cookie");
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function parseSetCookie(value: string, url: URL): StoredCookie {
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  const [nameValue, ...attributes] = parts;
  const [name, rawValue = ""] = nameValue.split("=");

  const cookie: StoredCookie = {
    name,
    value: rawValue,
    domain: url.hostname,
    path: "/",
    secure: false,
  };

  for (const attribute of attributes) {
    const [rawKey, rawAttrValue = ""] = attribute.split("=");
    const key = rawKey.toLowerCase();
    if (key === "domain" && rawAttrValue) {
      cookie.domain = rawAttrValue.replace(/^\./, "");
    } else if (key === "path" && rawAttrValue) {
      cookie.path = rawAttrValue;
    } else if (key === "secure") {
      cookie.secure = true;
    }
  }

  return cookie;
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
