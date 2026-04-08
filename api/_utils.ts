type AuthCookiePayload = {
  authenticated?: boolean;
  username?: string;
  authToken?: string;
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

export async function getFetch(): Promise<typeof fetch> {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  const undici: any = await import("undici");
  return undici.fetch;
}

