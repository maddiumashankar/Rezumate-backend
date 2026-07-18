import { v4 as uuid } from "uuid";
import { queryOne, queryAll, execute } from "../db";
import type { Resume, ResumeContent, ResumeMetadata, ResumeVersion } from "../../types";
import logger from "../../utils/logger";

export class ResumeRepository {
  async create(userId: string, title: string, content: ResumeContent, parsedFrom: Resume["parsedFrom"], uploadedFileName?: string): Promise<Resume> {
    const id = uuid();
    const now = new Date().toISOString();
    const metadata = this.extractMetadata(content);
    const existing = await queryOne("SELECT version_number FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY version_number DESC LIMIT 1", [userId]);
    const versionNumber = existing ? existing.version_number + 1 : 1;

    await execute(
      "INSERT INTO resumes (id, user_id, version_number, title, content_json, parsed_from, uploaded_file_name, ats_score, linked_to_jd_id, is_active, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, userId, versionNumber, title, JSON.stringify(content), parsedFrom, uploadedFileName || null, null, null, 1, JSON.stringify(metadata), now, now]
    );
    logger.info(`Created resume ${id} (v${versionNumber}) for user ${userId}`);
    return { id, userId, versionNumber, title, contentJson: content, parsedFrom, uploadedFileName: uploadedFileName || null, atsScore: null, linkedToJdId: null, isActive: true, metadata, createdAt: now, updatedAt: now };
  }

  async findLatestByUser(userId: string): Promise<Resume | null> {
    const row = await queryOne("SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY version_number DESC LIMIT 1", [userId]);
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<Resume | null> {
    const row = await queryOne("SELECT * FROM resumes WHERE id = ?", [id]);
    return row ? this.mapRow(row) : null;
  }

  async findAllByUser(userId: string): Promise<Resume[]> {
    const rows = await queryAll("SELECT * FROM resumes WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => this.mapRow(r));
  }

  async updateContent(id: string, content: ResumeContent): Promise<void> {
    const metadata = this.extractMetadata(content);
    await execute("UPDATE resumes SET content_json = ?, metadata = ?, updated_at = ? WHERE id = ?", [JSON.stringify(content), JSON.stringify(metadata), new Date().toISOString(), id]);
  }

  async updateAtsScore(id: string, score: number): Promise<void> {
    await execute("UPDATE resumes SET ats_score = ?, updated_at = ? WHERE id = ?", [score, new Date().toISOString(), id]);
  }

  async deactivate(id: string): Promise<void> {
    await execute("UPDATE resumes SET is_active = 0, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  }

  async createVersion(resumeId: string, changesSummary: string, contentSnapshot: ResumeContent, atsScoreBefore?: number, atsScoreAfter?: number, jdId?: string): Promise<ResumeVersion> {
    const id = uuid();
    const now = new Date().toISOString();
    const existing = await queryOne("SELECT version_number FROM resume_versions WHERE resume_id = ? ORDER BY version_number DESC LIMIT 1", [resumeId]);
    const versionNumber = existing ? existing.version_number + 1 : 1;

    await execute(
      "INSERT INTO resume_versions (id, resume_id, version_number, changes_summary, ats_score_before, ats_score_after, generated_for_jd_id, content_snapshot, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, resumeId, versionNumber, changesSummary, atsScoreBefore || null, atsScoreAfter || null, jdId || null, JSON.stringify(contentSnapshot), now, null]
    );
    return { id, resumeId, versionNumber, changesSummary, atsScoreBefore: atsScoreBefore || null, atsScoreAfter: atsScoreAfter || null, generatedForJdId: jdId || null, contentSnapshot, createdAt: now, approvedAt: null };
  }

  private extractMetadata(content: ResumeContent): ResumeMetadata {
    const allSkills = (content.skills || []).flatMap((c) => c.skills || []);
    const expYears = (content.experience || []).reduce((sum, exp) => {
      const start = new Date(exp.startDate); const end = exp.endDate ? new Date(exp.endDate) : new Date();
      return sum + (end.getFullYear() - start.getFullYear());
    }, 0);
    return { skills: allSkills, experienceYears: expYears, educationLevel: content.education[0]?.degree || "N/A", industries: [], totalBulletPoints: (content.experience || []).reduce((s, e) => s + (e.bullets || []).length, 0) };
  }

  private mapRow(row: any): Resume {
    return { id: row.id, userId: row.user_id, versionNumber: row.version_number, title: row.title, contentJson: JSON.parse(row.content_json), parsedFrom: row.parsed_from, uploadedFileName: row.uploaded_file_name, atsScore: row.ats_score, linkedToJdId: row.linked_to_jd_id, isActive: Boolean(row.is_active), metadata: JSON.parse(row.metadata), createdAt: row.created_at, updatedAt: row.updated_at };
  }
}

export const resumeRepo = new ResumeRepository();
