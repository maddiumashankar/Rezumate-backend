import { Router, type Request, type Response } from "express";
import { resumeRepo } from "../../database/repos/resumeRepository";
import { tailorResume } from "../../agents/resumeTailorAgent";
import { analyzeJD } from "../../services/jdService";
import { assertRateLimit } from "../../services/llmService";
import logger from "../../utils/logger";
import type { ResumeContent, JDKeywordAnalysis } from "../../types";

export const tailorRoutes = Router();

// POST /api/tailor — Start tailoring with SSE streaming
tailorRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const { resumeId, jdText, userId } = req.body;

    if (!resumeId || !jdText) {
      return res.status(400).json({ error: "resumeId and jdText are required" });
    }

    // Rate limit check
    if (userId) {
      try {
        assertRateLimit(userId);
      } catch (err: any) {
        return res.status(429).json({ error: err.message });
      }
    }

    // Get resume
    const resume = await resumeRepo.getById(resumeId);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const content: ResumeContent = JSON.parse(resume.content_json);

    // Analyze JD
    const jdAnalysis: JDKeywordAnalysis = await analyzeJD(jdText);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial event
    sendEvent("start", {
      message: "Starting tailoring pipeline",
      resumeId,
      jdSummary: {
        company: jdAnalysis.company,
        title: jdAnalysis.title,
        requiredSkills: jdAnalysis.requiredSkills.length,
        preferredSkills: jdAnalysis.preferredSkills.length,
      },
    });

    // Run tailoring with event streaming
    const result = await tailorResume(content, jdText, jdAnalysis, (event) => {
      switch (event.type) {
        case "iteration_start":
          sendEvent("pipeline_step", {
            step: "iteration",
            iteration: event.iteration,
            maxIterations: event.maxIterations,
            message: `Agent iteration ${event.iteration}/${event.maxIterations}`,
          });
          break;
        case "tool_start":
          sendEvent("pipeline_step", {
            step: event.tool,
            status: "started",
            message: `Running: ${event.tool}`,
            input: event.input,
          });
          break;
        case "tool_complete":
          sendEvent("pipeline_step", {
            step: event.tool,
            status: "complete",
            message: `Completed: ${event.tool}`,
          });
          break;
        case "tool_error":
          sendEvent("pipeline_step", {
            step: event.tool,
            status: "error",
            message: `Error in ${event.tool}: ${event.error}`,
          });
          break;
        case "complete":
          sendEvent("pipeline_step", {
            step: "final",
            status: "complete",
            message: "Agent finished reasoning",
          });
          break;
      }
    });

    // Send final results
    sendEvent("result", {
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
      changes: result.changes,
      changesSummary: result.changesSummary,
      tailoredContent: result.tailoredContent,
    });

    sendEvent("done", { message: "Tailoring complete" });
    res.end();
  } catch (err: any) {
    logger.error(`Tailoring error: ${err.message}`);
    // If SSE headers are already sent, send error event
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Tailoring failed: " + err.message });
    }
  }
});

// POST /api/tailor/apply — Apply selected changes to a resume
tailorRoutes.post("/apply", async (req: Request, res: Response) => {
  try {
    const { resumeId, tailoredContent, acceptedChangeIds, scoreBefore, scoreAfter } = req.body;

    if (!resumeId || !tailoredContent) {
      return res.status(400).json({ error: "resumeId and tailoredContent are required" });
    }

    // Save as new version
    const now = new Date().toISOString();

    await resumeRepo.update(resumeId, {
      content_json: JSON.stringify(tailoredContent),
      ats_score: scoreAfter,
      updated_at: now,
    });

    res.json({
      message: "Changes applied",
      resumeId,
      acceptedChanges: acceptedChangeIds?.length || 0,
      scoreBefore,
      scoreAfter,
    });
  } catch (err: any) {
    logger.error(`Apply changes error: ${err.message}`);
    res.status(500).json({ error: "Failed to apply changes" });
  }
});
