function clearAuthCookie(): string {
  return "ss_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function clearUpstreamCookie(): string {
  return "ss_flip=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });
    res.setHeader("Set-Cookie", [clearAuthCookie(), clearUpstreamCookie()]);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "로그아웃 처리 중 오류가 발생했습니다." });
  }
}
