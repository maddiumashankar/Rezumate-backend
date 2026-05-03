import { Router } from "express";
import { getActiveProvider, PROVIDER_CONFIGS } from "../../services/llmService";

export const healthRoutes = Router();

// GET /api/health — Health check
healthRoutes.get("/health", async (_req, res) => {
  const provider = getActiveProvider();
  const config = PROVIDER_CONFIGS[provider];

  let llmStatus = "unknown";

  if (provider === "ollama") {
    try {
      const resp = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        llmStatus = "connected";
      } else {
        llmStatus = "error";
      }
    } catch {
      llmStatus = "disconnected";
    }
  } else if (config.apiKey) {
    llmStatus = "configured";
  } else {
    llmStatus = "missing_api_key";
  }

  res.json({
    status: "healthy",
    version: "2.0.0",
    provider,
    model: config.model,
    llmStatus,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/info — System info
healthRoutes.get("/info", (_req, res) => {
  res.json({
    name: "Rezumate API",
    version: "2.0.0",
    description: "AI Resume Agent — REST API",
    endpoints: {
      "GET /api/health": "Health check",
      "GET /api/resumes?userId=": "List resumes",
      "POST /api/resumes": "Create resume",
      "GET /api/resumes/:id": "Get resume",
      "PUT /api/resumes/:id/sections/:section": "Update section",
      "POST /api/resumes/:id/score": "ATS score",
      "POST /api/resumes/:id/export": "Export PDF",
      "POST /api/tailor": "Start tailoring (SSE stream)",
      "POST /api/tailor/apply": "Apply changes",
      "GET /api/jobs?userId=": "List jobs",
      "POST /api/jobs": "Create job",
      "PATCH /api/jobs/:id": "Update job status",
    },
  });
});
