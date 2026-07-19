import type { ConversationState } from "../types";

/**
 * Valid state transitions map.
 * Simplified for conversational agentic tracking.
 */
export const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  IDLE: ["RESUME_UPLOAD", "JD_UPLOAD", "IDLE"],
  ONBOARDING: ["IDLE"],
  RESUME_UPLOAD: ["IDLE", "RESUME_REVIEW"],
  RESUME_REVIEW: ["IDLE"],
  RESUME_EDIT: ["IDLE"],
  JD_UPLOAD: ["IDLE"],
  ATS_ANALYSIS: ["IDLE"],
  CHANGE_APPROVAL: ["IDLE"],
  NEW_CONTENT: ["IDLE"],
  FINAL_REVIEW: ["IDLE"],
  TEMPLATE_SELECT: ["IDLE"],
  RESUME_BUILD: ["IDLE"],
  SKILLS_GAP: ["IDLE"],
  INTERVIEW_PREP: ["IDLE"],
  COVER_LETTER: ["IDLE"],
};

/**
 * User-facing prompt for each state.
 */
export const STATE_PROMPTS: Record<ConversationState, string> = {
  IDLE: "What would you like me to do next?",
  ONBOARDING: "Welcome to Rezumate! Let's get started. Do you have an existing resume?",
  RESUME_UPLOAD: "📄 Please upload your resume file (PDF or DOCX), or paste the text directly.",
  RESUME_REVIEW: "Here is your resume summary.",
  RESUME_EDIT: "What section or content would you like to edit?",
  JD_UPLOAD: "📋 Please paste the Job Description (JD) you want to analyze against:",
  ATS_ANALYSIS: "Analyzing your resume against the job description...",
  CHANGE_APPROVAL: "Suggested changes calculated.",
  NEW_CONTENT: "Would you like to add any new details?",
  FINAL_REVIEW: "Here's your tailored resume.",
  TEMPLATE_SELECT: "Choose a template:",
  RESUME_BUILD: "Let's build your resume.",
  SKILLS_GAP: "Running skills gap analysis...",
  INTERVIEW_PREP: "Generating mock interview preparation...",
  COVER_LETTER: "Generating tailored cover letter...",
};

/**
 * Check if a transition is valid.
 * In conversational mode, we allow transitions freely or to IDLE.
 */
export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
  return true;
}
