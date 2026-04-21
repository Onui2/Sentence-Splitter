export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import("../dist/index.cjs");
    const app = serverModule.default || serverModule.app || serverModule;
    if (serverModule.initPromise) {
      await serverModule.initPromise;
    }
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
