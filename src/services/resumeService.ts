import { resumeRepo } from "../database/repos/resumeRepository";
import { parseResumeFile, parseResumeText } from "../utils/resumeParser";
import type { Resume, ResumeContent } from "../types";
import logger from "../utils/logger";

export class ResumeService {
  /**
   * Create a resume from an uploaded file (PDF/DOCX).
   */
  async createFromFile(userId: string, filePath: string, fileName: string): Promise<Resume> {
    logger.info(`Parsing resume file: ${fileName}`);
    const content = await parseResumeFile(filePath);
    const title = content.personal.fullName
      ? `${content.personal.fullName}'s Resume`
      : `Resume from ${fileName}`;
    return resumeRepo.create(userId, title, content, "upload", fileName);
  }

  /**
   * Create a resume from raw text (pasted by user).
   */
  async createFromText(userId: string, text: string): Promise<Resume> {
    const content = await parseResumeText(text);
    const title = content.personal.fullName
      ? `${content.personal.fullName}'s Resume`
      : "My Resume";
    return resumeRepo.create(userId, title, content, "manual");
  }

  /**
   * Create a resume from a template.
   */
  async createFromTemplate(userId: string, templateContent: ResumeContent): Promise<Resume> {
    return resumeRepo.create(userId, "New Resume from Template", templateContent, "template");
  }

  /**
   * Get user's latest active resume.
   */
  async getLatest(userId: string): Promise<Resume | null> {
    return resumeRepo.findLatestByUser(userId);
  }

  /**
   * Get a specific resume by ID.
   */
  async getById(id: string): Promise<Resume | null> {
    return resumeRepo.findById(id);
  }

  /**
   * Get all resumes for a user.
   */
  async getAllForUser(userId: string): Promise<Resume[]> {
    return resumeRepo.findAllByUser(userId);
  }

  /**
   * Update a specific section of a resume.
   */
  async updateSection(resumeId: string, section: keyof ResumeContent, data: any): Promise<Resume> {
    const resume = await resumeRepo.findById(resumeId);
    if (!resume) throw new Error("Resume not found");

    const updated = { ...resume.contentJson, [section]: data };
    await resumeRepo.updateContent(resumeId, updated);

    return { ...resume, contentJson: updated };
  }

  /**
   * Apply tailored changes to a resume, creating a new version.
   */
  async applyTailoredChanges(
    resumeId: string,
    tailoredContent: ResumeContent,
    changesSummary: string,
    atsScoreBefore: number,
    atsScoreAfter: number,
    jdId?: string
  ): Promise<Resume> {
    const resume = await resumeRepo.findById(resumeId);
    if (!resume) throw new Error("Resume not found");

    // Save version snapshot before applying changes
    await resumeRepo.createVersion(
      resumeId,
      changesSummary,
      resume.contentJson,
      atsScoreBefore,
      atsScoreAfter,
      jdId
    );

    // Update the resume content
    await resumeRepo.updateContent(resumeId, tailoredContent);
    await resumeRepo.updateAtsScore(resumeId, atsScoreAfter);

    return { ...resume, contentJson: tailoredContent, atsScore: atsScoreAfter };
  }

  /**
   * Delete (deactivate) a resume.
   */
  async deactivate(resumeId: string): Promise<void> {
    await resumeRepo.deactivate(resumeId);
  }
}

export const resumeService = new ResumeService();
