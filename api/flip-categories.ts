function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);
}

function decodeAuthCookie(raw: string | undefined): any | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getAuthFromRequest(req: any): any | null {
  const cookies = parseCookies(req?.headers?.cookie);
  return decodeAuthCookie(cookies.ss_auth);
}

async function getFetch(): Promise<typeof fetch> {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  const undici: any = await import("undici");
  return undici.fetch;
}

export default async function handler(req: any, res: any) {
  try {
    const auth = getAuthFromRequest(req);
    if (!auth?.authenticated || !auth?.username || !auth?.authToken) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const fetchFn = await getFetch();
    const commonHeaders: Record<string, string> = {
      Accept: "application/json",
      "x-auth-token": auth.authToken,
    };

    if (req.method === "GET") {
      let r = await fetchFn("https://lms.flipedu.net/api/branch/shadowing-paper/classifys/all?subjectGroup=eng", {
        headers: commonHeaders,
      });
      if (!r.ok) {
        r = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys/all?subjectGroup=eng", {
          headers: commonHeaders,
        });
      }
      if (!r.ok) return res.status(r.status).json({ message: "카테고리를 불러올 수 없습니다." });
      const data = await r.json();
      return res.json(data);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body?.name || !String(body.name).trim()) {
        return res.status(400).json({ message: "카테고리 이름을 입력해주세요." });
      }
      const payload = [{ name: String(body.name).trim(), subjectGroup: "eng", ...(body.parentNo ? { parentNo: Number(body.parentNo) } : {}) }];
      let r = await fetchFn("https://lms.flipedu.net/api/branch/shadowing-paper/classifys", {
        method: "POST",
        headers: { ...commonHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        r = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys", {
          method: "POST",
          headers: { ...commonHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!r.ok) return res.status(r.status).json({ message: "카테고리 생성에 실패했습니다." });
      const data = await r.json().catch(() => ({}));
      return res.status(201).json(data);
    }

    return res.status(405).json({ message: "Method Not Allowed" });
  } catch {
    return res.status(500).json({ message: "카테고리 처리 중 오류가 발생했습니다." });
  }
}

