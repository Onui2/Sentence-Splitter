import { getAuthFromRequest, getFetch } from "./_utils";

export default async function handler(req: any, res: any) {
  try {
    const auth = getAuthFromRequest(req);
    if (!auth?.authenticated || !auth?.username || !auth?.authToken) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const fetchFn = await getFetch();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-auth-token": auth.authToken,
    };

    if (req.method === "GET") {
      let r = await fetchFn("https://lms.flipedu.net/api/branch/question-paper/classifys/all?subjectGroup=eng", { headers });
      if (!r.ok) {
        r = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys/all?subjectGroup=eng", { headers });
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
      let r = await fetchFn("https://lms.flipedu.net/api/branch/question-paper/classifys", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        r = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
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

