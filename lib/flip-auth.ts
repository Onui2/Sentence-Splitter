type AuthCookiePayload = {
  authenticated?: boolean;
  username?: string;
  authToken?: string;
  subjectGroupName?: string;
};

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);
}

export function decodeAuthCookie(raw: string | undefined): AuthCookiePayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getAuthFromRequest(req: any): AuthCookiePayload | null {
  const cookies = parseCookies(req?.headers?.cookie);
  return decodeAuthCookie(cookies.ss_auth);
}

export function getUpstreamCookiesFromRequest(req: any): string {
  const cookies = parseCookies(req?.headers?.cookie);
  const raw = cookies.ss_flip;
  if (!raw) return "";

  try {
    return Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export function getAuthTokenFromRequest(req: any, auth: AuthCookiePayload | null): string {
  const headerToken =
    (typeof req?.headers?.["x-auth-token"] === "string" && req.headers["x-auth-token"]) ||
    (typeof req?.headers?.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : "");
  return headerToken || auth?.authToken || "";
}

export function getPrimarySubjectGroup(auth: AuthCookiePayload | null): string {
  const raw = auth?.subjectGroupName || "eng";
  return String(raw).split(",").map((g) => g.trim()).filter(Boolean)[0] || "eng";
}

export async function getFetch(): Promise<typeof fetch> {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  const undici: any = await import("undici");
  return undici.fetch;
}

export function parseRequestBody(body: any): any {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export function createAuthHeaders(authToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-auth-token": authToken,
    Origin: "https://teacher.flipedu.net",
    Referer: "https://teacher.flipedu.net/",
  };
}

export function createEditorHeaders(authToken: string, upstreamCookies: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (authToken && authToken !== "authenticated") {
    headers["x-auth-token"] = authToken;
  }
  if (upstreamCookies) {
    headers.Cookie = upstreamCookies;
  }
  return headers;
}
