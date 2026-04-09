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
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-auth-token": auth.authToken,
    };

    const rawGroup = typeof req.query?.subjectGroup === "string" && req.query.subjectGroup.trim()
      ? req.query.subjectGroup
      : (typeof auth.subjectGroupName === "string" && auth.subjectGroupName.trim()
          ? auth.subjectGroupName
          : "eng");
    const subjectGroups = String(rawGroup).split(",").map((g) => g.trim()).filter(Boolean);

    const fetchSubjectsForGroup = async (subjectGroup: string): Promise<any[]> => {
      let r = await fetchFn(
        `https://lms.flipedu.net/api/branch/question/subjects/all?subjectGroup=${encodeURIComponent(subjectGroup)}`,
        { headers }
      );
      if (!r.ok) {
        r = await fetchFn(
          `https://dev.lms.flipedu.net/api/flipedu/branch/question/subjects/all?subjectGroup=${encodeURIComponent(subjectGroup)}`,
          { headers }
        );
      }
      if (!r.ok) {
        r = await fetchFn(
          `https://dev.lms.flipedu.net/api/flipedu/question/subjects/all?subjectGroup=${encodeURIComponent(subjectGroup)}`,
          { headers }
        );
      }
      if (!r.ok) {
        r = await fetchFn(
          `https://dev.mstr.flipedu.net/api/branch/question/subjects/all?subjectGroup=${encodeURIComponent(subjectGroup)}`,
          { headers }
        );
      }
      if (!r.ok) return [];

      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : (data?.content ?? data?.data ?? data?.subjects ?? data?.list ?? []);
    };

    const flattenSubjects = (nodes: any[], depth = 0): any[] => {
      const result: any[] = [];
      for (const node of nodes || []) {
        result.push({
          ...node,
          subjectNo: node.subjectNo ?? node.no ?? node.id ?? node.subjectId ?? node.classifyNo,
          name: node.name ?? node.subjectName ?? node.title ?? "",
          level: node.level ?? depth,
          ordering: node.ordering ?? 0,
        });
        if (Array.isArray(node.children) && node.children.length > 0) {
          result.push(...flattenSubjects(node.children, depth + 1));
        }
      }
      return result;
    };

    const allNodes: any[] = [];
    for (const subjectGroup of subjectGroups) {
      const nodes = await fetchSubjectsForGroup(subjectGroup);
      allNodes.push(...flattenSubjects(nodes));
    }

    return res.status(200).json(allNodes);
  } catch {
    return res.status(500).json({ message: "문제 카테고리를 불러오지 못했습니다." });
  }
}
