type AuthCookiePayload = {
  authenticated?: boolean;
  username?: string;
  authToken?: string;
  subjectGroupName?: string;
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

function getAuthFromRequest(req: any): AuthCookiePayload | null {
  const cookies = parseCookies(req?.headers?.cookie);
  return decodeAuthCookie(cookies.ss_auth);
}

function getAuthTokenFromRequest(req: any, auth: AuthCookiePayload | null): string {
  const headerToken =
    (typeof req?.headers?.["x-auth-token"] === "string" && req.headers["x-auth-token"]) ||
    (typeof req?.headers?.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : "");
  return headerToken || auth?.authToken || "";
}

function normalizeList(data: any): any[] {
  return Array.isArray(data) ? data : (data?.content ?? data?.data ?? data?.subjects ?? data?.list ?? []);
}

function appendQuery(url: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${url}?${search.toString()}`;
}

async function getFetch(): Promise<typeof fetch> {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  const undici: any = await import("undici");
  return undici.fetch;
}

export default async function handler(req: any, res: any) {
  try {
    const auth = getAuthFromRequest(req);
    const authToken = getAuthTokenFromRequest(req, auth);

    if (!auth?.authenticated || !auth?.username || !authToken) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const fetchFn = await getFetch();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-auth-token": authToken,
      Origin: "https://teacher.flipedu.net",
      Referer: "https://teacher.flipedu.net/",
    };

    const rawQueryGroup = req.query?.subjectGroup;
    const rawGroup = (Array.isArray(rawQueryGroup) ? rawQueryGroup.join(",") : rawQueryGroup)
      || auth.subjectGroupName
      || "eng";
    const subjectGroups = String(rawGroup).split(",").map((g) => g.trim()).filter(Boolean);

    const fetchSubjectsForGroup = async (subjectGroup: string): Promise<any[]> => {
      const attempts = [
        appendQuery("https://www.flipedu.net/api/v2/subjects/all", {
          subjectGroupName: subjectGroup,
          type: "QUESTION",
        }),
        appendQuery("https://dev.flipedu.net/api/v2/subjects/all", {
          subjectGroupName: subjectGroup,
          type: "QUESTION",
        }),
        appendQuery("https://lms.flipedu.net/api/question/subjects/all", {
          subjectGroup,
        }),
        appendQuery("https://lms.flipedu.net/api/branch/question/subjects/all", {
          subjectGroup,
        }),
        appendQuery("https://dev.lms.flipedu.net/api/flipedu/question/subjects/all", {
          subjectGroup,
        }),
        appendQuery("https://dev.lms.flipedu.net/api/flipedu/branch/question/subjects/all", {
          subjectGroup,
        }),
        appendQuery("https://dev.mstr.flipedu.net/api/question/subjects/all", {
          subjectGroup,
        }),
        appendQuery("https://dev.mstr.flipedu.net/api/branch/question/subjects/all", {
          subjectGroup,
        }),
      ];

      for (const url of attempts) {
        try {
          const response = await fetchFn(url, { headers });
          if (!response.ok) continue;

          const data = await response.json().catch(() => []);
          const list = normalizeList(data);
          if (list.length > 0) return list;
        } catch {
          // try next endpoint
        }
      }

      return [];
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

    if (allNodes.length === 0) {
      return res.status(502).json({ message: "문제 카테고리를 불러오지 못했습니다." });
    }

    return res.status(200).json(allNodes);
  } catch {
    return res.status(500).json({ message: "문제 카테고리를 불러오지 못했습니다." });
  }
}
