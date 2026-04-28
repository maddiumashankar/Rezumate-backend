import { jdRepo } from "../database/repos/jdRepository";
import { callClaude, parseJsonFromResponse } from "./llmService";
import type { JobDescription, JDKeywordAnalysis } from "../types";
import logger from "../utils/logger";

export class JDService {
  /**
   * Parse a job description text and store it.
   */
  async parseAndStore(userId: string, jdText: string): Promise<JobDescription> {
    const analysis = await this.analyzeJD(jdText);
    return jdRepo.create(
      userId,
      analysis.companyName,
      analysis.jobTitle,
      jdText,
      analysis.keywords,
      undefined
    );
  }

  /**
   * Analyze a JD to extract company, title, and keywords using Claude.
   */
  async analyzeJD(jdText: string): Promise<{ companyName: string; jobTitle: string; keywords: JDKeywordAnalysis }> {
    const systemPrompt = `You are an expert job description analyzer. Extract structured data from the job description.
Return a JSON object matching this EXACT structure:

{
  "companyName": "Company Name (extract from JD or put 'Unknown')",
  "jobTitle": "Job Title",
  "keywords": {
    "requiredSkills": ["skill1", "skill2"],
    "preferredSkills": ["skill1", "skill2"],
    "keywords": ["keyword1", "keyword2"],
    "experienceLevel": "entry/mid/senior/lead/executive",
    "educationRequirement": "Bachelor's/Master's/PhD/Any",
    "responsibilities": ["resp1", "resp2"],
    "industry": "Technology/Finance/Healthcare/etc"
  }
}

Rules:
- requiredSkills: skills explicitly stated as "required", "must have", or listed as core
- preferredSkills: skills stated as "nice to have", "preferred", "bonus"
- keywords: ALL important technical terms, tools, methodologies mentioned
- Extract the ACTUAL company name and job title from the posting
- Return ONLY valid JSON`;

    const response = await callClaude(
      `Analyze this job description:\n\n${jdText}`,
      systemPrompt,
      2048
    );

    const parsed = parseJsonFromResponse<{ companyName: string; jobTitle: string; keywords: JDKeywordAnalysis }>(response.text);
    if (!parsed) {
      logger.error("Failed to parse JD analysis");
      return {
        companyName: "Unknown Company",
        jobTitle: "Unknown Position",
        keywords: {
          requiredSkills: [],
          preferredSkills: [],
          keywords: [],
          experienceLevel: "mid",
          educationRequirement: "Any",
          responsibilities: [],
          industry: "Unknown",
        },
      };
    }

    return parsed;
  }

  /**
   * Get a JD by ID.
   */
  async getById(id: string): Promise<JobDescription | null> {
    return jdRepo.findById(id);
  }

  /**
   * Get all JDs for a user.
   */
  async getByUser(userId: string): Promise<JobDescription[]> {
    return jdRepo.findByUser(userId);
  }
}

export const jdService = new JDService();
