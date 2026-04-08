type AuthCookiePayload = {
  authenticated?: boolean;
  username?: string;
  academyName?: string;
  brandName?: string;
  branchName?: string;
};

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);
}

function decodeAuthCookie(raw: string | undefined): AuthCookiePayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method Not Allowed" });
    const cookies = parseCookies(req.headers?.cookie);
    const auth = decodeAuthCookie(cookies.ss_auth);
    if (!auth?.authenticated || !auth?.username) return res.json({ authenticated: false });

    return res.json({
      authenticated: true,
      username: auth.username,
      academyName: auth.academyName ?? "",
      brandName: auth.brandName ?? "",
      branchName: auth.branchName ?? "",
    });
  } catch {
    return res.status(500).json({ message: "인증 상태 조회 중 오류가 발생했습니다." });
  }
}

