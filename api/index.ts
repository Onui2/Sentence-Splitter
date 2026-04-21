export default async function handler(req: any, res: any) {
  try {
    // Dynamically import to catch any top-level module initialization errors that break Vercel
    const serverModule = await import("../server/index");
    const app = serverModule.default;
    const initPromise = serverModule.initPromise;

    await initPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel] API initialization failed:", err);
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: "API initialization failed", 
        error: err.message || String(err),
        stack: err.stack
      });
    }
  }
}
