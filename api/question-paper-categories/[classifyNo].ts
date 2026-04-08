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

    const classifyNo = String(req.query?.classifyNo ?? "").trim();
    if (!classifyNo) return res.status(400).json({ message: "classifyNo가 필요합니다." });

    const fetchFn = await getFetch();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-auth-token": auth.authToken,
    };

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body?.name || !String(body.name).trim()) {
        return res.status(400).json({ message: "카테고리 이름을 입력해주세요." });
      }
      const payload = [{ classifyNo: Number(classifyNo), name: String(body.name).trim() }];
      let r = await fetchFn("https://lms.flipedu.net/api/branch/question-paper/classifys", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        r = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys", {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!r.ok) return res.status(r.status).json({ message: "카테고리 수정에 실패했습니다." });
      const data = await r.json().catch(() => ({}));
      return res.json(data);
    }

    if (req.method === "DELETE") {
      let r = await fetchFn(`https://lms.flipedu.net/api/branch/question-paper/classifys/${classifyNo}`, {
        method: "DELETE",
        headers,
      });
      if (!r.ok) {
        r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys?classifyNos=${classifyNo}`, {
          method: "DELETE",
          headers,
        });
      }
      if (!r.ok) return res.status(r.status).json({ message: "카테고리 삭제에 실패했습니다." });
      return res.json({ success: true });
    }

    return res.status(405).json({ message: "Method Not Allowed" });
  } catch {
    return res.status(500).json({ message: "카테고리 처리 중 오류가 발생했습니다." });
  }
}

