import { callLLM, parseJsonFromResponse } from "../services/llmService";
import type { ResumeContent } from "../types";
import { createEmptyResumeContent } from "../types";
import logger from "../utils/logger";

interface EditResult {
  updatedResume: ResumeContent;
  changeSummary: string;
}

/**
 * Edit a resume using a natural language instruction.
 */
export async function editResumeWithAI(
  currentContent: ResumeContent,
  instruction: string
): Promise<EditResult> {
  logger.info(`Editing resume with instruction: "${instruction}"`);

  const systemPrompt = `You are an expert AI Resume Editor. 
Your task is to take a structured JSON resume and apply a user's natural language editing instruction.
Make sure to keep all other fields intact unless requested to modify them.
If the user asks to add an item (like a project, experience, or skill), generate a unique ID for it (e.g., exp_x, edu_x, proj_x) and populate its fields appropriately based on the instruction.
Ensure the output JSON strictly matches the original ResumeContent schema.

Return a JSON object matching this EXACT format:
{
  "updatedResume": {
    "personal": { ... },
    "summary": "...",
    "experience": [ ... ],
    "education": [ ... ],
    "skills": [ ... ],
    "certifications": [ ... ],
    "projects": [ ... ],
    "languages": [ ... ],
    "customSections": [ ... ]
  },
  "changeSummary": "A concise, single-sentence summary of the changes made (e.g., 'Added React Project called Tasker and updated summary skills section')"
}

Do not include any explanation or markdown formatting outside the JSON code block. Output ONLY the raw JSON.`;

  const prompt = `Current Resume JSON:
${JSON.stringify(currentContent, null, 2)}

User Instruction:
"${instruction}"

Apply the instruction and output the updated JSON:`;

  const response = await callLLM(prompt, systemPrompt, 4096);
  const parsed = parseJsonFromResponse<EditResult>(response.text);

  if (!parsed || !parsed.updatedResume) {
    logger.error("Failed to parse edit results from LLM response");
    throw new Error("I couldn't process that edit instruction. Please try again with different phrasing.");
  }

  // Ensure structure is clean
  const cleanResume = { ...createEmptyResumeContent(), ...parsed.updatedResume };

  // Restore any missing/empty personal details (like links) that were present in currentContent
  if (currentContent.personal) {
    cleanResume.personal = {
      ...cleanResume.personal,
    };
    for (const key of Object.keys(currentContent.personal)) {
      const val = currentContent.personal[key as keyof typeof currentContent.personal];
      if (val && !cleanResume.personal[key as keyof typeof cleanResume.personal]) {
        (cleanResume.personal as any)[key] = val;
      }
    }
  }

  return {
    updatedResume: cleanResume,
    changeSummary: parsed.changeSummary || "Updated resume details",
  };
}

/**
 * Generate a warm, personalized agentic assessment/summary of the resume.
 */
export async function generateResumeAssessment(content: ResumeContent): Promise<string> {
  const prompt = `You are a helpful and warm AI career agent named Rezumate.
Analyze this candidate's structured resume:
\n${JSON.stringify(content, null, 2)}

Provide a warm, professional, and personalized assessment of the candidate in Markdown.
Write exactly 3 to 4 sentences introducing the candidate, highlighting their primary tech stack/specialization, approximate years of experience, and notable highlights (e.g. key projects or achievements). 
Include:
- **Key Strengths**: [List 2-3 strengths]
- **Recommended Focus**: [List 1-2 quick suggestions for tailoring or skills gap]

Keep the tone highly encouraging, collaborative, and conversational (acting as an agent). Reference the user by their first name if available. Do not output metadata or system warnings.`;

  try {
    const response = await callLLM(prompt, "You are a warm, collaborative AI career agent.", 1024);
    return response.text.trim();
  } catch (err: any) {
    logger.error(`Failed to generate resume assessment: ${err.message}`);
    return `👋 Welcome! I've parsed your resume. It looks like you have some solid experience listed. Let's work together to optimize it for your target roles.`;
  }
}
