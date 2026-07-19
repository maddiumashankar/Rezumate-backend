import { agenticToolLoop, parseJsonFromResponse, type LLMToolDefinition, type AgentEvent } from "../services/llmService";
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
    description: "Rewrite a specific resume section to better match the job requirements. You must provide the rewritten content in the 'rewritten_content' field of your response after calling this tool.",
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
    name: "calculate_ats_score",
    description: "Calculate the current ATS compatibility score of the resume against the job description. Use this to check progress.",
    input_schema: {
      type: "object",
      properties: {
        resume_json: { type: "string", description: "The current resume content as a JSON string" },
      },
      required: ["resume_json"],
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
 * Takes a resume + JD, uses the LLM in an agentic loop to tailor the resume.
 * Supports an optional onEvent callback for streaming progress to the UI.
 */
export async function tailorResume(
  resume: ResumeContent,
  jdText: string,
  jdAnalysis: JDKeywordAnalysis,
  onEvent?: (event: AgentEvent) => void
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
2. Then use tailor_resume_section for each section that needs improvement (summary, experience, skills)
3. Use calculate_ats_score to verify improvements
4. Finally use generate_change_summary to list all changes

IMPORTANT: Return the COMPLETE tailored resume as JSON at the end of your response, wrapped in \`\`\`json code blocks.
The JSON must match the exact ResumeContent structure.
Only modify content to better match the JD — never invent experiences or skills.`;

  // Track section rewrites for building the tailored content
  const sectionRewrites: Record<string, any> = {};

  const toolExecutor = async (toolName: string, input: Record<string, any>): Promise<string> => {
    switch (toolName) {
      case "extract_job_requirements":
        // Return the real JD analysis data
        return JSON.stringify({
          requiredSkills: jdAnalysis.requiredSkills,
          preferredSkills: jdAnalysis.preferredSkills,
          keywords: jdAnalysis.keywords,
          experienceLevel: jdAnalysis.experienceLevel,
          responsibilities: jdAnalysis.responsibilities,
          industry: jdAnalysis.industry,
          educationRequirement: jdAnalysis.educationRequirement,
          missingFromResume: initialScore.missingKeywords,
          matchedKeywords: initialScore.matchedKeywords,
          currentScore: scoreBefore,
        });

      case "tailor_resume_section": {
        // Record the section being tailored for tracking
        const sectionName = input.section_name || "unknown";
        const targetKeywords = input.target_keywords || [];
        const currentContent = input.current_content || "";

        // Store the rewrite request for later comparison
        sectionRewrites[sectionName] = {
          original: currentContent,
          targetKeywords,
          jobTitle: input.job_title,
        };

        // Return actionable guidance to the LLM
        return JSON.stringify({
          status: "ready_for_rewrite",
          section: sectionName,
          guidance: {
            keywords_to_incorporate: targetKeywords,
            missing_keywords: initialScore.missingKeywords.filter(
              (k) => targetKeywords.some((tk: string) => tk.toLowerCase().includes(k.toLowerCase()))
            ),
            suggestions: initialScore.suggestions
              .filter((s) => s.section.toLowerCase().includes(sectionName.toLowerCase()))
              .map((s) => s.suggestion),
            rules: [
              "Start experience bullets with strong action verbs (Led, Architected, Delivered, Implemented)",
              "Include quantified metrics where possible (%, $, numbers)",
              "Naturally incorporate target keywords — don't keyword-stuff",
              "Keep bullet points to 1-2 lines each",
              "For skills section, organize into clear categories matching the JD",
              "For summary, position candidate directly for the target role",
            ],
          },
          instruction: `Rewrite the ${sectionName} section. Include the rewritten content in your next response. The rewritten content should naturally incorporate these keywords: ${targetKeywords.join(", ")}`,
        });
      }

      case "calculate_ats_score": {
        // Actually calculate the ATS score with the current state
        try {
          const resumeData = JSON.parse(input.resume_json);
          const score = calculateATSScore(resumeData, jdAnalysis);
          return JSON.stringify({
            overallScore: score.overallScore,
            breakdown: score.breakdown,
            matchedKeywords: score.matchedKeywords.length,
            missingKeywords: score.missingKeywords.slice(0, 10),
            improvement: score.overallScore - scoreBefore,
            suggestions: score.suggestions.slice(0, 3).map((s) => s.suggestion),
          });
        } catch {
          return JSON.stringify({
            error: "Could not parse resume JSON. Please provide valid JSON.",
            currentScore: scoreBefore,
          });
        }
      }

      case "generate_change_summary": {
        const changes = input.changes || [];
        const summaryParts = changes.map(
          (c: any) => `• ${c.section}: ${c.description} (${c.change_type})`
        );
        return JSON.stringify({
          summary: summaryParts.join("\n"),
          totalChanges: changes.length,
          sectionsModified: [...new Set(changes.map((c: any) => c.section))],
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  };

  const result = await agenticToolLoop(prompt, SYSTEM_PROMPT, TOOLS, toolExecutor, 8, onEvent);

  // Parse the tailored resume from the final response
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

  // Preserve original personal details (links, email, phone, etc.) to prevent data loss
  tailoredContent.personal = {
    ...tailoredContent.personal,
    ...resume.personal,
  };

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

    const origBullets = (orig.bullets || []).join("|");
    const tailBullets = (tail.bullets || []).join("|");
    if (origBullets !== tailBullets) {
      changes.push({
        id: `change_${++changeId}`,
        section: `Experience: ${orig.title} at ${orig.company}`,
        originalContent: (orig.bullets || []).join("\n"),
        suggestedContent: (tail.bullets || []).join("\n"),
        reason: "Enhanced bullet points with stronger action verbs and relevant keywords",
        impactOnScore: 8,
      });
    }

    // Check if technologies were updated
    const origTech = (orig.technologies || []).join("|");
    const tailTech = (tail.technologies || []).join("|");
    if (origTech !== tailTech) {
      changes.push({
        id: `change_${++changeId}`,
        section: `Technologies: ${orig.title} at ${orig.company}`,
        originalContent: (orig.technologies || []).join(", "),
        suggestedContent: (tail.technologies || []).join(", "),
        reason: "Updated technology list to match job description requirements",
        impactOnScore: 3,
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
      originalContent: original.skills.map((c) => `${c.category}: ${(c.skills || []).join(", ")}`).join("\n"),
      suggestedContent: tailored.skills.map((c) => `${c.category}: ${(c.skills || []).join(", ")}`).join("\n"),
      reason: "Reorganized and enhanced skills to match job requirements",
      impactOnScore: 10,
    });
  }

  // Projects changes
  for (let i = 0; i < Math.max(original.projects.length, tailored.projects.length); i++) {
    const orig = original.projects[i];
    const tail = tailored.projects[i];
    if (!orig || !tail) continue;

    const origProj = JSON.stringify(orig);
    const tailProj = JSON.stringify(tail);
    if (origProj !== tailProj) {
      changes.push({
        id: `change_${++changeId}`,
        section: `Project: ${orig.name}`,
        originalContent: [orig.description, ...(orig.bullets || [])].join("\n"),
        suggestedContent: [tail.description, ...(tail.bullets || [])].join("\n"),
        reason: "Enhanced project description with relevant keywords",
        impactOnScore: 4,
      });
    }
  }

  return changes;
}
