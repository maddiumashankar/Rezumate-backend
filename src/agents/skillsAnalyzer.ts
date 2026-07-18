import { callLLM, parseJsonFromResponse } from "../services/llmService";
import type { ResumeContent, JDKeywordAnalysis } from "../types";
import logger from "../utils/logger";

export interface SkillsGapResult {
  matchingSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
  recommendations: SkillRecommendation[];
  overallFitPercentage: number;
}

export interface SkillRecommendation {
  skill: string;
  priority: "critical" | "important" | "nice_to_have";
  reason: string;
  learningResources: string[];
  estimatedTimeToLearn: string;
}

/**
 * Analyze skills gap between resume and JD.
 */
export async function analyzeSkillsGap(
  resume: ResumeContent,
  jdAnalysis: JDKeywordAnalysis
): Promise<SkillsGapResult> {
  const resumeSkills = resume.skills.flatMap((c) => c.skills).map((s) => s.toLowerCase());
  const resumeText = [
    ...resume.experience.flatMap((e) => [...(e.bullets || []), ...(e.technologies || [])]),
    ...resume.projects.flatMap((p) => [...(p.bullets || []), ...(p.technologies || [])]),
  ]
    .join(" ")
    .toLowerCase();

  const matchingSkills: string[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];

  for (const skill of jdAnalysis.requiredSkills) {
    if (resumeSkills.some((s) => s.includes(skill.toLowerCase())) || resumeText.includes(skill.toLowerCase())) {
      matchingSkills.push(skill);
    } else {
      missingRequired.push(skill);
    }
  }

  for (const skill of jdAnalysis.preferredSkills) {
    if (resumeSkills.some((s) => s.includes(skill.toLowerCase())) || resumeText.includes(skill.toLowerCase())) {
      if (!matchingSkills.includes(skill)) matchingSkills.push(skill);
    } else {
      missingPreferred.push(skill);
    }
  }

  const totalRelevant = jdAnalysis.requiredSkills.length + jdAnalysis.preferredSkills.length;
  const overallFitPercentage = totalRelevant > 0
    ? Math.round((matchingSkills.length / totalRelevant) * 100)
    : 100;

  // Get AI recommendations for missing skills
  const recommendations = await getSkillRecommendations(missingRequired, missingPreferred, jdAnalysis);

  logger.info(`Skills gap analysis: ${overallFitPercentage}% fit, ${missingRequired.length} critical gaps`);

  return { matchingSkills, missingRequired, missingPreferred, recommendations, overallFitPercentage };
}

async function getSkillRecommendations(
  missingRequired: string[],
  missingPreferred: string[],
  jdAnalysis: JDKeywordAnalysis
): Promise<SkillRecommendation[]> {
  if (missingRequired.length === 0 && missingPreferred.length === 0) return [];

  try {
    const response = await callLLM(
      `For these missing skills for a ${jdAnalysis.experienceLevel} ${jdAnalysis.industry} role, provide learning recommendations.

CRITICAL (Required): ${missingRequired.join(", ") || "None"}
IMPORTANT (Preferred): ${missingPreferred.join(", ") || "None"}

Return JSON array:
[{
  "skill": "skill name",
  "priority": "critical|important|nice_to_have",
  "reason": "Why this matters for the role",
  "learningResources": ["Free resource 1", "Free resource 2"],
  "estimatedTimeToLearn": "e.g., 2-4 weeks"
}]

Focus on the top 5 most impactful skills. Only return JSON.`,
      "You are a career development advisor. Provide practical, free learning resources.",
      1500
    );

    return parseJsonFromResponse<SkillRecommendation[]>(response.text) || [];
  } catch {
    // Fallback: basic recommendations without AI
    return [
      ...missingRequired.slice(0, 3).map((s) => ({
        skill: s,
        priority: "critical" as const,
        reason: "Listed as required in job description",
        learningResources: ["Search for free tutorials online"],
        estimatedTimeToLearn: "Varies",
      })),
      ...missingPreferred.slice(0, 2).map((s) => ({
        skill: s,
        priority: "nice_to_have" as const,
        reason: "Listed as preferred in job description",
        learningResources: ["Search for free tutorials online"],
        estimatedTimeToLearn: "Varies",
      })),
    ];
  }
}

/**
 * Format skills gap result for Telegram display.
 */
export function formatSkillsGap(result: SkillsGapResult): string {
  const fitEmoji = result.overallFitPercentage >= 80 ? "🟢" : result.overallFitPercentage >= 50 ? "🟡" : "🔴";

  let text = `${fitEmoji} *Skills Fit: ${result.overallFitPercentage}%*\n\n`;

  if (result.matchingSkills.length > 0) {
    text += `✅ *Matching Skills (${result.matchingSkills.length}):*\n${result.matchingSkills.join(", ")}\n\n`;
  }

  if (result.missingRequired.length > 0) {
    text += `🔴 *Missing Required Skills (${result.missingRequired.length}):*\n${result.missingRequired.join(", ")}\n\n`;
  }

  if (result.missingPreferred.length > 0) {
    text += `🟡 *Missing Preferred Skills (${result.missingPreferred.length}):*\n${result.missingPreferred.join(", ")}\n\n`;
  }

  if (result.recommendations.length > 0) {
    text += `📚 *Learning Recommendations:*\n`;
    for (const rec of result.recommendations.slice(0, 5)) {
      text += `\n*${rec.skill}* (${rec.priority})\n`;
      text += `  ⏱ ${rec.estimatedTimeToLearn}\n`;
      text += `  📖 ${rec.learningResources.slice(0, 2).join(", ")}\n`;
    }
  }

  return text;
}
