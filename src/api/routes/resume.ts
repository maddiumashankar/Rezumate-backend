import { Router } from "express";
import { resumeRepo } from "../../database/repos/resumeRepository";
import { userRepo } from "../../database/repos/userRepository";
import { parseResumeText } from "../../utils/resumeParser";
import { calculateATSScore } from "../../utils/atsAlgorithm";
import { generatePDF } from "../../services/pdfService";
import logger from "../../utils/logger";
import type { ResumeContent, JDKeywordAnalysis } from "../../types";

export const resumeRoutes = Router();

// GET /api/resumes — List all resumes for a user
resumeRoutes.get("/", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const resumes = await resumeRepo.getByUserId(userId);
    res.json({
      resumes: resumes.map((r: any) => ({
        id: r.id,
        title: r.title,
        version: r.version_number,
        atsScore: r.ats_score,
        isActive: r.is_active === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err: any) {
    logger.error(`List resumes error: ${err.message}`);
    res.status(500).json({ error: "Failed to list resumes" });
  }
});

// GET /api/resumes/:id — Get a single resume with full content
resumeRoutes.get("/:id", async (req, res) => {
  try {
    const resume = await resumeRepo.getById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    let content: ResumeContent;
    try {
      content = JSON.parse(resume.content_json);
    } catch {
      content = {} as ResumeContent;
    }

    res.json({
      id: resume.id,
      title: resume.title,
      version: resume.version_number,
      content,
      atsScore: resume.ats_score,
      linkedJdId: resume.linked_to_jd_id,
      createdAt: resume.created_at,
      updatedAt: resume.updated_at,
    });
  } catch (err: any) {
    logger.error(`Get resume error: ${err.message}`);
    res.status(500).json({ error: "Failed to get resume" });
  }
});

// POST /api/resumes — Create a resume from text
resumeRoutes.post("/", async (req, res) => {
  try {
    const { userId, title, text, content } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    let resumeContent: ResumeContent;

    if (content) {
      // Direct JSON content provided
      resumeContent = content;
    } else if (text) {
      // Parse from raw text using LLM
      resumeContent = await parseResumeText(text);
    } else {
      return res.status(400).json({ error: "Either 'text' or 'content' is required" });
    }

    const resumeId = `resume_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    await resumeRepo.create({
      id: resumeId,
      user_id: userId,
      version_number: 1,
      title: title || `Resume ${new Date().toLocaleDateString()}`,
      content_json: JSON.stringify(resumeContent),
      parsed_from: content ? "manual" : "text",
      uploaded_file_name: null,
      ats_score: null,
      linked_to_jd_id: null,
      is_active: 1,
      metadata: "{}",
      created_at: now,
      updated_at: now,
    });

    res.status(201).json({
      id: resumeId,
      title: title || `Resume ${new Date().toLocaleDateString()}`,
      content: resumeContent,
      createdAt: now,
    });
  } catch (err: any) {
    logger.error(`Create resume error: ${err.message}`);
    res.status(500).json({ error: "Failed to create resume" });
  }
});

// PUT /api/resumes/:id/sections/:section — Update a specific section
resumeRoutes.put("/:id/sections/:section", async (req, res) => {
  try {
    const { id, section } = req.params;
    const { content: sectionContent } = req.body;

    const resume = await resumeRepo.getById(id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const resumeContent: ResumeContent = JSON.parse(resume.content_json);

    // Update the specific section
    const validSections = ["personal", "summary", "experience", "education", "skills", "projects", "certifications", "languages"];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: `Invalid section: ${section}. Valid: ${validSections.join(", ")}` });
    }

    (resumeContent as any)[section] = sectionContent;

    await resumeRepo.update(id, {
      content_json: JSON.stringify(resumeContent),
      updated_at: new Date().toISOString(),
    });

    res.json({ message: "Section updated", section, content: resumeContent });
  } catch (err: any) {
    logger.error(`Update section error: ${err.message}`);
    res.status(500).json({ error: "Failed to update section" });
  }
});

// POST /api/resumes/:id/score — Score resume against a JD
resumeRoutes.post("/:id/score", async (req, res) => {
  try {
    const resume = await resumeRepo.getById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const { jdAnalysis } = req.body;
    if (!jdAnalysis) {
      return res.status(400).json({ error: "jdAnalysis is required" });
    }

    const content: ResumeContent = JSON.parse(resume.content_json);
    const score = calculateATSScore(content, jdAnalysis as JDKeywordAnalysis);

    // Save score to resume
    await resumeRepo.update(req.params.id, {
      ats_score: score.overallScore,
      updated_at: new Date().toISOString(),
    });

    res.json(score);
  } catch (err: any) {
    logger.error(`Score resume error: ${err.message}`);
    res.status(500).json({ error: "Failed to score resume" });
  }
});

// POST /api/resumes/:id/export — Generate PDF
resumeRoutes.post("/:id/export", async (req, res) => {
  try {
    const resume = await resumeRepo.getById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const content: ResumeContent = JSON.parse(resume.content_json);
    const pdfBuffer = await generatePDF(content);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rezumate_${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    logger.error(`Export error: ${err.message}`);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// DELETE /api/resumes/:id — Soft-delete a resume
resumeRoutes.delete("/:id", async (req, res) => {
  try {
    await resumeRepo.update(req.params.id, {
      is_active: 0,
      updated_at: new Date().toISOString(),
    });
    res.json({ message: "Resume deleted" });
  } catch (err: any) {
    logger.error(`Delete resume error: ${err.message}`);
    res.status(500).json({ error: "Failed to delete resume" });
  }
});
