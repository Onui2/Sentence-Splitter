type Handler = (req: any, res: any) => Promise<any>;

function normalizePath(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((part) => String(part)).filter(Boolean);
  if (typeof input === "string") return input.split("/").map((part) => part.trim()).filter(Boolean);
  return [];
}

async function resolveHandler(segments: string[]): Promise<Handler | null> {
  if (segments.length === 2 && segments[0] === "auth" && segments[1] === "partners") {
    return (await import("../vercel-handlers/api/auth/partners")).default;
  }
  if (segments.length === 2 && segments[0] === "auth" && segments[1] === "branches") {
    return (await import("../vercel-handlers/api/auth/branches")).default;
  }
  if (segments.length === 2 && segments[0] === "auth" && segments[1] === "login") {
    return (await import("../vercel-handlers/api/auth/login")).default;
  }
  if (segments.length === 2 && segments[0] === "auth" && segments[1] === "me") {
    return (await import("../vercel-handlers/api/auth/me")).default;
  }
  if (segments.length === 2 && segments[0] === "auth" && segments[1] === "logout") {
    return (await import("../vercel-handlers/api/auth/logout")).default;
  }
  if (segments.length === 1 && segments[0] === "question-subjects") {
    return (await import("../vercel-handlers/api/question-subjects")).default;
  }
  if (segments.length === 1 && segments[0] === "flip-categories") {
    return (await import("../vercel-handlers/api/flip-categories/index")).default;
  }
  if (segments.length === 2 && segments[0] === "flip-categories") {
    return (await import("../vercel-handlers/api/flip-categories/[classifyNo]")).default;
  }
  if (segments.length === 1 && segments[0] === "question-paper-categories") {
    return (await import("../vercel-handlers/api/question-paper-categories/index")).default;
  }
  if (segments.length === 2 && segments[0] === "question-paper-categories") {
    return (await import("../vercel-handlers/api/question-paper-categories/[classifyNo]")).default;
  }
  if (segments.length === 1 && segments[0] === "question-papers") {
    return (await import("../vercel-handlers/api/question-papers/index")).default;
  }
  if (segments.length === 2 && segments[0] === "question-papers") {
    return (await import("../vercel-handlers/api/question-papers/[paperNo]")).default;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  const segments = normalizePath(req.query?.path);

  if (segments[0] === "flip-categories" && segments[1]) {
    req.query = { ...req.query, classifyNo: segments[1] };
  }
  if (segments[0] === "question-paper-categories" && segments[1]) {
    req.query = { ...req.query, classifyNo: segments[1] };
  }
  if (segments[0] === "question-papers" && segments[1]) {
    req.query = { ...req.query, paperNo: segments[1] };
  }

  const routeHandler = await resolveHandler(segments);
  if (!routeHandler) {
    return res.status(404).json({ message: "Not Found" });
  }

  return routeHandler(req, res);
}
