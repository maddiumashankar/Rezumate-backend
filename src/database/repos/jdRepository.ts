import { v4 as uuid } from "uuid";
import { queryOne, queryAll, execute } from "../db";
import type { JobDescription, JDKeywordAnalysis } from "../../types";
import logger from "../../utils/logger";

export class JDRepository {
  async create(userId: string, companyName: string, jobTitle: string, content: string, keywordAnalysis: JDKeywordAnalysis, sourceUrl?: string): Promise<JobDescription> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute("INSERT INTO job_descriptions (id, user_id, company_name, job_title, content, source_url, keyword_analysis, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, userId, companyName, jobTitle, content, sourceUrl || null, JSON.stringify(keywordAnalysis), now]);
    logger.info(`Created JD ${id}: ${jobTitle} at ${companyName}`);
    return { id, userId, companyName, jobTitle, content, sourceUrl: sourceUrl || null, keywordAnalysis, createdAt: now };
  }

  async findById(id: string): Promise<JobDescription | null> {
    const row = await queryOne("SELECT * FROM job_descriptions WHERE id = ?", [id]);
    return row ? this.mapRow(row) : null;
  }

  async findByUser(userId: string): Promise<JobDescription[]> {
    const rows = await queryAll("SELECT * FROM job_descriptions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): JobDescription {
    return { id: row.id, userId: row.user_id, companyName: row.company_name, jobTitle: row.job_title, content: row.content, sourceUrl: row.source_url, keywordAnalysis: JSON.parse(row.keyword_analysis), createdAt: row.created_at };
  }
}

export const jdRepo = new JDRepository();
