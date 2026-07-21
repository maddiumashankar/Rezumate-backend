import { calculateATSScore, calculateStandaloneATSScore } from "../utils/atsAlgorithm";
import { callLLM, parseJsonFromResponse } from "../services/llmService";
import type { ResumeContent, JDKeywordAnalysis, ATSScore } from "../types";
import logger from "../utils/logger";

/**
 * Enhanced ATS scoring that combines algorithmic scoring with AI analysis.
 */
export async function enhancedATSScore(
  resume: ResumeContent,
  jdAnalysis: JDKeywordAnalysis
): Promise<ATSScore> {
  // Step 1: Algorithmic score
  const algorithmicScore = calculateATSScore(resume, jdAnalysis);

  // Step 2: AI-enhanced analysis for better suggestions
  try {
    const aiEnhancements = await getAISuggestions(resume, jdAnalysis, algorithmicScore);
    if (aiEnhancements) {
      // Merge AI suggestions with algorithmic ones (AI gets priority)
      const mergedSuggestions = [
        ...aiEnhancements.slice(0, 3),
        ...algorithmicScore.suggestions.filter(
          (s) => !aiEnhancements.some((ai) => ai.section === s.section)
        ),
      ].slice(0, 8);

      return { ...algorithmicScore, suggestions: mergedSuggestions };
    }
  } catch (err: any) {
    logger.warn(`AI scoring enhancement failed, using algorithmic only: ${err.message}`);
  }

  return algorithmicScore;
}

/**
 * Standalone ATS scoring when no Job Description is attached.
 */
export async function standaloneATSScore(resume: ResumeContent): Promise<ATSScore> {
  const algorithmicScore = calculateStandaloneATSScore(resume);
  try {
    const aiEnhancements = await getStandaloneAISuggestions(resume, algorithmicScore);
    if (aiEnhancements && aiEnhancements.length > 0) {
      const mergedSuggestions = [
        ...aiEnhancements.slice(0, 3),
        ...algorithmicScore.suggestions.filter(
          (s) => !aiEnhancements.some((ai) => ai.section === s.section)
        ),
      ].slice(0, 8);

      return { ...algorithmicScore, suggestions: mergedSuggestions };
    }
  } catch (err: any) {
    logger.warn(`Standalone AI scoring enhancement failed: ${err.message}`);
  }

  return algorithmicScore;
}

async function getAISuggestions(
  resume: ResumeContent,
  jdAnalysis: JDKeywordAnalysis,
  currentScore: ATSScore
): Promise<ATSScore["suggestions"] | null> {
  const response = await callLLM(
    `Given this resume ATS analysis, provide 3-5 specific, actionable suggestions.

Current Score: ${currentScore.overallScore}/100
Missing Keywords: ${currentScore.missingKeywords.slice(0, 15).join(", ")}
Matched Keywords: ${currentScore.matchedKeywords.slice(0, 15).join(", ")}

Resume Summary: ${resume.summary?.substring(0, 200) || "None"}
Experience count: ${resume.experience.length}
Skills: ${resume.skills.map((c) => c.skills.join(", ")).join("; ")}

JD Required: ${jdAnalysis.requiredSkills.join(", ")}
JD Preferred: ${jdAnalysis.preferredSkills.join(", ")}
JD Level: ${jdAnalysis.experienceLevel}

Return a JSON array of suggestions:
[
  {
    "section": "Experience|Skills|Summary|Education|Projects",
    "priority": "high|medium|low",
    "suggestion": "Specific actionable suggestion",
    "impact": "Expected impact description"
  }
]

Only return the JSON array, nothing else.`,
    "You are an ATS optimization expert. Provide specific, actionable resume improvement suggestions. Return only JSON.",
    1024
  );

  return parseJsonFromResponse<ATSScore["suggestions"]>(response.text);
}

async function getStandaloneAISuggestions(
  resume: ResumeContent,
  currentScore: ATSScore
): Promise<ATSScore["suggestions"] | null> {
  const response = await callLLM(
    `Given this candidate resume content, provide 3-5 high-impact ATS readability and formatting suggestions to maximize general recruiter parsing:

Current General ATS Readiness Score: ${currentScore.overallScore}/100
Format Score: ${currentScore.breakdown.formatScore}/100
Bullet Quality: ${currentScore.breakdown.bulletQuality}/100
Section Completeness: ${currentScore.breakdown.sectionCompleteness}/100

Resume Summary: ${resume.summary?.substring(0, 200) || "None"}
Experience entries: ${resume.experience.length}
Skills listed: ${resume.skills.map((c) => c.skills.join(", ")).join("; ")}

Return a JSON array of suggestions:
[
  {
    "section": "Experience|Skills|Summary|Education|Projects",
    "priority": "high|medium|low",
    "suggestion": "Actionable suggestion",
    "impact": "Expected impact description"
  }
]

Only return raw JSON array.`,
    "You are an expert ATS auditor. Provide specific, actionable suggestions for improving general resume parsing. Return only JSON.",
    1024
  );

  return parseJsonFromResponse<ATSScore["suggestions"]>(response.text);
}
