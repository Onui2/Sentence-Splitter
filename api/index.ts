export default async function handler(req: any, res: any) {
  try {
    // Vercel strict ESM node resolution breaks on extensionless relative imports in the raw TS files.
    // Instead of letting Vercel compile the raw 'server/' dir, we use the fully bundled dist file 
    // which is generated during 'npm run build' step prior to the serverless function build.
    const { createRequire } = await import("module");
    const require_cjs = createRequire(import.meta.url);
    const serverModule = require_cjs("../dist/index.cjs");
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
