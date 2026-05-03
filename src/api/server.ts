import express from "express";
import cors from "cors";
import logger from "../utils/logger";
import { resumeRoutes } from "./routes/resume";
import { tailorRoutes } from "./routes/tailor";
import { jobRoutes } from "./routes/jobs";
import { healthRoutes } from "./routes/health";

const API_PORT = parseInt(process.env.API_PORT || "3001", 10);

export function createApiServer(): express.Express {
  const app = express();

  // ── Middleware ──
  app.use(cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // ── Routes ──
  app.use("/api/resumes", resumeRoutes);
  app.use("/api/tailor", tailorRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api", healthRoutes);

  // ── Error Handler ──
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`API Error: ${err.message}`);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  });

  return app;
}

export function startApiServer(): void {
  const app = createApiServer();
  app.listen(API_PORT, () => {
    logger.info(`🌐 REST API running at http://localhost:${API_PORT}`);
  });
}
