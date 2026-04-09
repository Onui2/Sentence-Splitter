async function getFetch(): Promise<typeof fetch> {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  const undici: any = await import("undici");
  return undici.fetch;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method Not Allowed" });

    const name = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
    const trimmedName = String(name ?? "").trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "학원명을 입력해주세요." });
    }

    const fetchFn = await getFetch();
    const partnerEndpoints = [
      `https://www.flipedu.net/api/v2/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://dev.flipedu.net/api/v2/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://www.flipedu.net/api/v2/auth/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://dev.flipedu.net/api/v2/auth/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://lms.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://dev.lms.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
      `https://dev.mstr.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
    ];

    const headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Origin: "https://teacher.flipedu.net",
      Referer: "https://teacher.flipedu.net/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    };

    for (const endpoint of partnerEndpoints) {
      try {
        const upstream = await fetchFn(endpoint, { headers, redirect: "follow" });
        if (!upstream.ok) continue;

        const raw: any = await upstream.json().catch(() => null);
        if (!raw) continue;

        const candidateRoot = raw?.data ?? raw;
        const candidateArray =
          Array.isArray(candidateRoot) ? candidateRoot :
          Array.isArray(candidateRoot?.contents) ? candidateRoot.contents :
          Array.isArray(candidateRoot?.content) ? candidateRoot.content :
          null;

        const candidate = (candidateArray ? candidateArray[0] : candidateRoot) ?? null;
        if (!candidate) continue;

        const brandNo = String(candidate?.brandNo ?? candidate?.brand_no ?? candidate?.brand ?? candidate?.id ?? "");
        if (!brandNo) continue;

        const logo = (candidate?.logo ?? null) as string | null;
        const displayName = String(candidate?.name ?? candidate?.brandName ?? candidate?.brand_name ?? trimmedName);
        return res.json({ brandNo, logo, name: displayName });
      } catch {
        // try next endpoint
      }
    }

    return res.status(404).json({ message: "해당학원을 찾을 수 없습니다." });
  } catch {
    return res.status(500).json({ message: "학원 검색 중 오류가 발생했습니다." });
  }
}
