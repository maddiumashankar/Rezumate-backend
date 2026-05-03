import { Router } from "express";
import { execute, queryAll, queryOne } from "../../database/db";
import logger from "../../utils/logger";

export const jobRoutes = Router();

// GET /api/jobs — List all job applications for a user
jobRoutes.get("/", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const jobs = await queryAll(
      `SELECT ja.*, jd.company_name, jd.job_title, jd.source_url
       FROM job_applications ja
       JOIN job_descriptions jd ON ja.jd_id = jd.id
       WHERE ja.user_id = ?
       ORDER BY ja.updated_at DESC`,
      [userId]
    );

    res.json({
      jobs: jobs.map((j: any) => ({
        id: j.id,
        company: j.company_name,
        title: j.job_title,
        status: j.status,
        applicationDate: j.application_date,
        atsScore: j.ats_score,
        resumeId: j.resume_id,
        sourceUrl: j.source_url,
        notes: j.notes,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
      })),
    });
  } catch (err: any) {
    logger.error(`List jobs error: ${err.message}`);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

// POST /api/jobs — Create a new job application
jobRoutes.post("/", async (req, res) => {
  try {
    const { userId, company, title, jdText, sourceUrl, resumeId, status } = req.body;

    if (!userId || !company || !title) {
      return res.status(400).json({ error: "userId, company, and title are required" });
    }

    const now = new Date().toISOString();
    const jdId = `jd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create JD record
    await execute(
      `INSERT INTO job_descriptions (id, user_id, company_name, job_title, content, source_url, keyword_analysis, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
      [jdId, userId, company, title, jdText || "", sourceUrl || null, now]
    );

    // Create job application
    await execute(
      `INSERT INTO job_applications (id, user_id, jd_id, resume_id, status, application_date, notes, ats_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', NULL, ?, ?)`,
      [jobId, userId, jdId, resumeId || "", status || "draft", null, now, now]
    );

    res.status(201).json({
      id: jobId,
      jdId,
      company,
      title,
      status: status || "draft",
      createdAt: now,
    });
  } catch (err: any) {
    logger.error(`Create job error: ${err.message}`);
    res.status(500).json({ error: "Failed to create job application" });
  }
});

// PATCH /api/jobs/:id — Update job application status
jobRoutes.patch("/:id", async (req, res) => {
  try {
    const { status, notes, applicationDate } = req.body;
    const now = new Date().toISOString();

    const updates: string[] = [`updated_at = ?`];
    const params: any[] = [now];

    if (status) {
      const validStatuses = ["draft", "applied", "screening", "interview", "offer", "rejected", "withdrawn"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(", ")}` });
      }
      updates.push(`status = ?`);
      params.push(status);
    }

    if (notes !== undefined) {
      updates.push(`notes = ?`);
      params.push(notes);
    }

    if (applicationDate) {
      updates.push(`application_date = ?`);
      params.push(applicationDate);
    }

    params.push(req.params.id);

    await execute(
      `UPDATE job_applications SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    res.json({ message: "Job application updated", id: req.params.id });
  } catch (err: any) {
    logger.error(`Update job error: ${err.message}`);
    res.status(500).json({ error: "Failed to update job" });
  }
});

// DELETE /api/jobs/:id — Delete a job application
jobRoutes.delete("/:id", async (req, res) => {
  try {
    const job = await queryOne(`SELECT jd_id FROM job_applications WHERE id = ?`, [req.params.id]);
    if (job) {
      await execute(`DELETE FROM job_applications WHERE id = ?`, [req.params.id]);
      await execute(`DELETE FROM job_descriptions WHERE id = ?`, [job.jd_id]);
    }
    res.json({ message: "Job application deleted" });
  } catch (err: any) {
    logger.error(`Delete job error: ${err.message}`);
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// GET /api/jobs/stats — Get job application statistics
jobRoutes.get("/stats", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const stats = await queryAll(
      `SELECT status, COUNT(*) as count FROM job_applications WHERE user_id = ? GROUP BY status`,
      [userId]
    );

    const total = stats.reduce((sum: number, s: any) => sum + s.count, 0);
    const byStatus: Record<string, number> = {};
    for (const s of stats) {
      byStatus[s.status] = s.count;
    }

    res.json({
      total,
      byStatus,
      responseRate: total > 0 ? Math.round(((byStatus["interview"] || 0) + (byStatus["offer"] || 0)) / total * 100) : 0,
    });
  } catch (err: any) {
    logger.error(`Job stats error: ${err.message}`);
    res.status(500).json({ error: "Failed to get job stats" });
  }
});
