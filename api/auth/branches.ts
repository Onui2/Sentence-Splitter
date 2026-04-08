import type { VercelRequest, VercelResponse } from "@vercel/node";

type Branch = { value: string; label1: string; label2?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method Not Allowed" });
    const brandNoRaw = Array.isArray(req.query.brandNo) ? req.query.brandNo[0] : req.query.brandNo;
    const brandNo = String(brandNoRaw ?? "").trim();
    if (!brandNo) return res.status(400).json({ message: "brandNo가 필요합니다." });

    const url = `https://www.flipedu.net/api/v2/branches?sys=0&brand=${encodeURIComponent(brandNo)}`;
    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: "https://teacher.flipedu.net",
        Referer: "https://teacher.flipedu.net/",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(500).json({ message: "지점 목록을 불러올 수 없습니다.", detail: text.slice(0, 200) });
    }

    const raw: any = await upstream.json().catch(() => null);
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.content) ? raw.content : null;
    if (!arr) return res.status(500).json({ message: "지점 응답 형식이 올바르지 않습니다." });

    const branches: Branch[] = arr.map((b: any) => ({
      value: String(b.branchNo ?? b.id ?? b.no ?? ""),
      label1: String(b.branchName ?? b.name ?? ""),
      label2: b.label2 ? String(b.label2) : undefined,
    }));

    return res.json(branches);
  } catch {
    return res.status(500).json({ message: "지점 조회 중 오류가 발생했습니다." });
  }
}

