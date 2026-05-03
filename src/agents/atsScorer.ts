import { calculateATSScore } from "../utils/atsAlgorithm";
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
