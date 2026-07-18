import { callLLM, parseJsonFromResponse } from "../services/llmService";
import type { ResumeContent } from "../types";
import logger from "../utils/logger";

export interface InterviewQuestion {
  question: string;
  type: "Behavioral" | "Technical" | "Situational";
  intent: string;
  strategy: string;
}

/**
 * Generate tailored interview questions based on the candidate's resume and target JD.
 */
export async function generateInterviewPrep(
  resume: ResumeContent,
  jdContent: string
): Promise<InterviewQuestion[]> {
  logger.info(`Generating interview prep questions for candidate: ${resume.personal.fullName}`);

  const systemPrompt = `You are an expert technical recruiter and interview coach.
Your task is to generate exactly 5 tailored interview questions (a mix of technical and behavioral/situational) for a candidate applying to a role based on their resume and the job description.
For each question:
1. Formulate a specific question that connects the job description's requirements with the candidate's actual experience/projects.
2. Explain the interviewer's intent (what they are looking for).
3. Provide a clear STAR (Situation, Task, Action, Result) answer strategy customized for this candidate, mentioning specific details from their resume they should reference.

Return a JSON array of objects with this structure:
[{
  "question": "question text",
  "type": "Behavioral" | "Technical" | "Situational",
  "intent": "interviewer intent",
  "strategy": "customized STAR response strategy"
}]

Do not include any explanation or markdown formatting outside the JSON code block. Output ONLY the raw JSON.`;

  const prompt = `CANDIDATE RESUME:
${JSON.stringify(resume, null, 2)}

JOB DESCRIPTION:
${jdContent}

Generate the 5 interview prep questions in JSON:`;

  try {
    const response = await callLLM(prompt, systemPrompt, 2048);
    const parsed = parseJsonFromResponse<InterviewQuestion[]>(response.text);
    return parsed || [];
  } catch (err: any) {
    logger.error(`Error generating interview prep: ${err.message}`);
    throw new Error("Failed to generate interview prep questions. Please try again.");
  }
}

/**
 * Format interview questions for Telegram chat.
 */
export function formatInterviewPrep(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return "⚠️ I couldn't generate interview questions. Please try again.";
  }

  let text = `🎤 *Tailored Interview Preparation*\n`;
  text += `Here are 5 questions custom-tailored for this role based on your experience:\n\n`;

  questions.forEach((q, idx) => {
    text += `*Q${idx + 1}. [${q.type}] ${q.question}*\n`;
    text += `💡 *Intent:* _${q.intent}_\n`;
    text += `🔑 *Suggested STAR Strategy:* ${q.strategy}\n\n`;
  });

  return text.trim();
}
