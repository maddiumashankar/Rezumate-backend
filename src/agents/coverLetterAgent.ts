import { callLLM } from "../services/llmService";
import type { ResumeContent, JDKeywordAnalysis } from "../types";
import logger from "../utils/logger";

/**
 * Generate a tailored cover letter based on resume and JD.
 */
export async function generateCoverLetter(
  resume: ResumeContent,
  jdAnalysis: JDKeywordAnalysis,
  jdText: string
): Promise<string> {
  const systemPrompt = `You are an expert cover letter writer. Create a compelling, personalized cover letter that:
1. Opens with a strong hook mentioning the specific role and company
2. Highlights 2-3 most relevant experiences from the resume that match the JD
3. Demonstrates knowledge of the company/industry
4. Shows enthusiasm and cultural fit
5. Closes with a clear call to action

Keep it concise (3-4 paragraphs, ~300 words). Be professional but personable.
Do NOT use generic filler — every sentence should add value.`;

  const prompt = `Write a tailored cover letter for:

CANDIDATE: ${resume.personal.fullName}
CURRENT TITLE: ${resume.personal.title}
APPLYING FOR: ${jdAnalysis.experienceLevel} ${jdAnalysis.industry} role

KEY EXPERIENCE:
${resume.experience
    .slice(0, 3)
    .map((e) => `- ${e.title} at ${e.company}: ${e.bullets.slice(0, 2).join("; ")}`)
    .join("\n")}

KEY SKILLS: ${resume.skills.flatMap((c) => c.skills).slice(0, 10).join(", ")}

COMPANY: ${jdAnalysis.industry || "the company"}
JOB TITLE: ${jdAnalysis.experienceLevel}
REQUIRED SKILLS: ${jdAnalysis.requiredSkills.join(", ")}
KEY RESPONSIBILITIES: ${jdAnalysis.responsibilities.slice(0, 5).join("; ")}

JOB DESCRIPTION:
${jdText.substring(0, 2000)}

Generate ONLY the cover letter text — no labels, no "Dear Hiring Manager:" header (I'll add that).`;

  const response = await callLLM(prompt, systemPrompt, 1500);
  logger.info("Cover letter generated");
  return response.text;
}
