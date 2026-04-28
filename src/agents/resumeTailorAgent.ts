import { agenticToolLoop, parseJsonFromResponse, type LLMToolDefinition } from "../services/llmService";
import type { ResumeContent, JDKeywordAnalysis, TailoringChange } from "../types";
import { calculateATSScore } from "../utils/atsAlgorithm";
import logger from "../utils/logger";

const SYSTEM_PROMPT = `You are an expert resume writer and ATS optimization specialist named Rezumate.
Your job is to tailor a resume to perfectly match a specific job description while keeping the content truthful and professional.

Key principles:
1. NEVER fabricate experience or skills the candidate doesn't have
2. Reword existing experience to highlight relevant keywords from the JD
3. Reorder sections to prioritize the most relevant content
4. Strengthen bullet points with action verbs and quantifiable metrics
5. Ensure ATS-friendly formatting
6. Maintain a professional tone throughout

You have access to tools to analyze the JD, tailor resume sections, and calculate scores.
Use these tools systematically to produce the best possible tailored resume.`;

const TOOLS: LLMToolDefinition[] = [
  {
    name: "extract_job_requirements",
    description: "Extract key requirements, skills, and keywords from a job description. Call this first to understand what the JD needs.",
    input_schema: {
      type: "object",
      properties: {
        jd_text: { type: "string", description: "The full job description text" },
      },
      required: ["jd_text"],
    },
  },
  {
    name: "tailor_resume_section",
    description: "Rewrite a specific resume section to better match the job requirements. Returns the improved content.",
    input_schema: {
      type: "object",
      properties: {
        section_name: { type: "string", description: "Section to tailor: summary, experience, skills, projects" },
        current_content: { type: "string", description: "The current content of this section as JSON" },
        target_keywords: { type: "array", items: { type: "string" }, description: "Keywords to incorporate" },
        job_title: { type: "string", description: "The target job title" },
      },
      required: ["section_name", "current_content", "target_keywords", "job_title"],
    },
  },
  {
    name: "generate_change_summary",
    description: "Generate a human-readable summary of all changes made to the resume.",
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section: { type: "string" },
              change_type: { type: "string" },
              description: { type: "string" },
            },
          },
          description: "List of changes made",
        },
      },
      required: ["changes"],
    },
  },
];

export interface TailorResult {
  tailoredContent: ResumeContent;
  changes: TailoringChange[];
  changesSummary: string;
  scoreBefore: number;
  scoreAfter: number;
}

/**
 * Main resume tailoring agent.
 * Takes a resume + JD, uses Gemini in an agentic loop to tailor the resume.
 */
export async function tailorResume(
  resume: ResumeContent,
  jdText: string,
  jdAnalysis: JDKeywordAnalysis
): Promise<TailorResult> {
  // Calculate initial ATS score
  const initialScore = calculateATSScore(resume, jdAnalysis);
  const scoreBefore = initialScore.overallScore;

  logger.info(`Starting tailoring. Initial ATS score: ${scoreBefore}`);

  const prompt = `I need you to tailor this resume for the following job description.

RESUME (JSON):
${JSON.stringify(resume, null, 2)}

JOB DESCRIPTION:
${jdText}

JD KEYWORD ANALYSIS:
${JSON.stringify(jdAnalysis, null, 2)}

CURRENT ATS SCORE: ${scoreBefore}/100
Missing keywords: ${initialScore.missingKeywords.join(", ")}
Suggestions: ${initialScore.suggestions.map((s) => s.suggestion).join("; ")}

Please:
1. First use extract_job_requirements to understand the JD deeply
2. Then use tailor_resume_section to improve the summary, experience bullets, and skills
3. Finally use generate_change_summary to list all changes

IMPORTANT: Return the COMPLETE tailored resume as JSON at the end of your response, wrapped in \`\`\`json code blocks.
The JSON must match the exact ResumeContent structure.
Only modify content to better match the JD — never invent experiences or skills.`;

  const toolExecutor = async (toolName: string, input: Record<string, any>): Promise<string> => {
    switch (toolName) {
      case "extract_job_requirements":
        return JSON.stringify({
          requiredSkills: jdAnalysis.requiredSkills,
          preferredSkills: jdAnalysis.preferredSkills,
          keywords: jdAnalysis.keywords,
          experienceLevel: jdAnalysis.experienceLevel,
          responsibilities: jdAnalysis.responsibilities,
          industry: jdAnalysis.industry,
        });

      case "tailor_resume_section":
        // Let Gemini handle the actual rewriting — we just acknowledge
        return JSON.stringify({
          status: "ready",
          section: input.section_name,
          keywords_to_incorporate: input.target_keywords,
          instruction: "Please rewrite this section incorporating the target keywords naturally while maintaining truthfulness.",
        });

      case "generate_change_summary":
        const changes = input.changes || [];
        return JSON.stringify({
          summary: changes.map((c: any) => `${c.section}: ${c.description}`).join("\n"),
          totalChanges: changes.length,
        });

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  };

  const result = await agenticToolLoop(prompt, SYSTEM_PROMPT, TOOLS, toolExecutor, 8);

  // Parse the tailored resume from Gemini's final response
  const tailoredContent = parseJsonFromResponse<ResumeContent>(result.finalText);

  if (!tailoredContent) {
    logger.warn("Could not parse tailored resume from agent response, returning original");
    return {
      tailoredContent: resume,
      changes: [],
      changesSummary: "Agent could not generate changes. Please try again.",
      scoreBefore,
      scoreAfter: scoreBefore,
    };
  }

  // Calculate new ATS score
  const newScore = calculateATSScore(tailoredContent, jdAnalysis);
  const scoreAfter = newScore.overallScore;

  // Extract changes by comparing sections
  const changes = detectChanges(resume, tailoredContent);

  // Generate a human-readable summary
  const changesSummary = changes.length > 0
    ? `Applied ${changes.length} changes across ${[...new Set(changes.map((c) => c.section))].join(", ")}. Score: ${scoreBefore} → ${scoreAfter} (+${scoreAfter - scoreBefore})`
    : "No changes were needed.";

  logger.info(`Tailoring complete. Score: ${scoreBefore} → ${scoreAfter}`);

  return { tailoredContent, changes, changesSummary, scoreBefore, scoreAfter };
}

/**
 * Detect differences between original and tailored resume.
 */
function detectChanges(original: ResumeContent, tailored: ResumeContent): TailoringChange[] {
  const changes: TailoringChange[] = [];
  let changeId = 0;

  // Summary change
  if (original.summary !== tailored.summary) {
    changes.push({
      id: `change_${++changeId}`,
      section: "Summary",
      originalContent: original.summary,
      suggestedContent: tailored.summary,
      reason: "Optimized summary to highlight relevant experience and keywords",
      impactOnScore: 5,
    });
  }

  // Experience changes
  for (let i = 0; i < Math.max(original.experience.length, tailored.experience.length); i++) {
    const orig = original.experience[i];
    const tail = tailored.experience[i];
    if (!orig || !tail) continue;

    const origBullets = orig.bullets.join("|");
    const tailBullets = tail.bullets.join("|");
    if (origBullets !== tailBullets) {
      changes.push({
        id: `change_${++changeId}`,
        section: `Experience: ${orig.title} at ${orig.company}`,
        originalContent: orig.bullets.join("\n"),
        suggestedContent: tail.bullets.join("\n"),
        reason: "Enhanced bullet points with stronger action verbs and relevant keywords",
        impactOnScore: 8,
      });
    }
  }

  // Skills changes
  const origSkills = JSON.stringify(original.skills);
  const tailSkills = JSON.stringify(tailored.skills);
  if (origSkills !== tailSkills) {
    changes.push({
      id: `change_${++changeId}`,
      section: "Skills",
      originalContent: original.skills.map((c) => `${c.category}: ${c.skills.join(", ")}`).join("\n"),
      suggestedContent: tailored.skills.map((c) => `${c.category}: ${c.skills.join(", ")}`).join("\n"),
      reason: "Reorganized and enhanced skills to match job requirements",
      impactOnScore: 10,
    });
  }

  return changes;
}
