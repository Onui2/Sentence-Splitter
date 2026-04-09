type LoginBody = {
  brandNo?: string;
  branchNo?: string;
  username?: string;
  credential?: string;
  brandName?: string;
  branchName?: string;
};

type AuthCookiePayload = {
  authenticated: boolean;
  username: string;
  brandNo: string;
  branchNo: string;
  academyName?: string;
  brandName?: string;
  branchName?: string;
  authToken?: string;
  subjectGroupName?: string;
};

type LoginSuccess = {
  ok: true;
  token: string;
  subjectGroupName: string;
  upstreamCookies: string;
};

type LoginFailure = {
  ok: false;
  message: string;
};

function parseBody(body: any): LoginBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body as LoginBody;
}

function decodeCredential(credential: string): string {
  try {
    return decodeURIComponent(Buffer.from(credential, "base64").toString("utf8"));
  } catch {
    return credential;
  }
}

function encodeAuthCookie(payload: AuthCookiePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function buildAuthSetCookie(value: string): string {
  const maxAge = 60 * 60 * 24; // 1 day
  return `ss_auth=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function encodeOpaqueCookieValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildUpstreamSetCookie(value: string): string {
  const maxAge = 60 * 60 * 24; // 1 day
  return `ss_flip=${encodeOpaqueCookieValue(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function parseSetCookies(headers: Headers): string {
  try {
    if (typeof (headers as any).getSetCookie === "function") {
      const values = (headers as any).getSetCookie();
      if (Array.isArray(values) && values.length > 0) {
        return values.map((entry: string) => entry.split(";")[0]).join("; ");
      }
    }

    const raw = headers.get("set-cookie");
    if (!raw) return "";

    return raw
      .split(/,(?=[^;]+=[^;]+)/)
      .map((entry) => entry.trim().split(";")[0])
      .filter(Boolean)
      .join("; ");
  } catch {
    return "";
  }
}

async function tryFlipLogin(
  input: Required<Pick<LoginBody, "brandNo" | "branchNo" | "username" | "credential">>,
): Promise<LoginSuccess | LoginFailure> {
  const plainPassword = decodeCredential(input.credential);
  const primaryBody = {
    sysSeq: 0,
    brand: Number(input.brandNo),
    type: "STAFF",
    branch: Number(input.branchNo),
    username: input.username,
    password: plainPassword,
  };
  const lmsBody = {
    brandNo: Number(input.brandNo),
    branchNo: Number(input.branchNo),
    username: input.username,
    password: plainPassword,
  };

  const attempts = [
    { url: "https://www.flipedu.net/api/v2/login", body: primaryBody },
    { url: "https://dev.flipedu.net/api/v2/login", body: primaryBody },
    { url: "https://lms.flipedu.net/api/auth/login", body: lmsBody },
    { url: "https://dev.lms.flipedu.net/api/auth/login", body: lmsBody },
    { url: "https://dev.mstr.flipedu.net/api/auth/login", body: lmsBody },
  ];

  let lastMessage = "로그인에 실패했습니다.";
  for (const attempt of attempts) {
    try {
      const r = await fetch(attempt.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: "https://teacher.flipedu.net",
          Referer: "https://teacher.flipedu.net/",
        },
        body: JSON.stringify(attempt.body),
      });

      const data: any = await r.json().catch(() => ({}));
      if (r.ok) {
        const token =
          r.headers.get("x-auth-token") ||
          data?.token ||
          data?.authToken ||
          data?.user?.token ||
          "";
        const subjectGroupNameRaw = data?.subjectGroupName || data?.user?.subjectGroupName || "eng";
        const subjectGroupName = Array.isArray(subjectGroupNameRaw)
          ? subjectGroupNameRaw.join(",")
          : String(subjectGroupNameRaw || "eng");
        return {
          ok: true as const,
          token,
          subjectGroupName,
          upstreamCookies: parseSetCookies(r.headers),
        };
      }
      lastMessage = data?.message || data?.error || lastMessage;
    } catch {
      // continue next attempt
    }
  }

  return { ok: false as const, message: lastMessage };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

    const body = parseBody(req.body);
    const brandNo = String(body.brandNo ?? "").trim();
    const branchNo = String(body.branchNo ?? "").trim();
    const username = String(body.username ?? "").trim();
    const credential = String(body.credential ?? "").trim();

    if (!brandNo || !branchNo || !username || !credential) {
      return res.status(400).json({ message: "모든 필드를 입력해주세요." });
    }

    const loginResult = await tryFlipLogin({ brandNo, branchNo, username, credential });
    if (!loginResult.ok) {
      return res.status(401).json({ message: loginResult.message });
    }

    const payload: AuthCookiePayload = {
      authenticated: true,
      username,
      brandNo,
      branchNo,
      academyName: body.brandName ?? "",
      brandName: body.brandName ?? "",
      branchName: body.branchName ?? "",
      authToken: loginResult.token || "",
      subjectGroupName: loginResult.subjectGroupName || "eng",
    };

    const cookies = [buildAuthSetCookie(encodeAuthCookie(payload))];
    if (loginResult.upstreamCookies) {
      cookies.push(buildUpstreamSetCookie(loginResult.upstreamCookies));
    }

    res.setHeader("Set-Cookie", cookies);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "로그인 처리 중 오류가 발생했습니다." });
  }
}
