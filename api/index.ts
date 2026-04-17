import app, { initPromise } from "../server/index";

export default async function handler(req: any, res: any) {
  try {
    await initPromise;
    return app(req, res);
  } catch (err) {
    console.error("[Vercel] API initialization failed:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: "API initialization failed" });
    }
  }
}
