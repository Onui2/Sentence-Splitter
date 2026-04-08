import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method Not Allowed" });
    const name = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return res.status(400).json({ message: "학원명을 입력해주세요." });

    const url = `https://www.flipedu.net/api/v2/partners?name=${encodeURIComponent(trimmed)}`;
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
      return res.status(404).json({ message: "학원을 찾을 수 없습니다.", detail: text.slice(0, 200) });
    }

    const raw: any = await upstream.json().catch(() => null);
    if (!raw) return res.status(404).json({ message: "학원을 찾을 수 없습니다." });

    // Response commonly: { sysSeq: 0, brandNo: "3", logo: null }
    const candidate = raw?.data ?? raw;
    const brandNo = String(candidate?.brandNo ?? candidate?.brand_no ?? candidate?.brand ?? candidate?.id ?? "");
    if (!brandNo) return res.status(404).json({ message: "학원을 찾을 수 없습니다." });

    return res.json({ brandNo, logo: candidate?.logo ?? null, name: candidate?.name ?? trimmed });
  } catch (e: any) {
    return res.status(500).json({ message: "학원 검색 중 오류가 발생했습니다." });
  }
}

