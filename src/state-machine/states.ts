import type { ConversationState } from "../types";

/**
 * Valid state transitions map.
 * Key = current state, Value = array of allowed next states.
 */
export const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  IDLE: ["RESUME_UPLOAD", "TEMPLATE_SELECT", "SKILLS_GAP", "INTERVIEW_PREP", "COVER_LETTER", "ONBOARDING"],
  ONBOARDING: ["IDLE", "RESUME_UPLOAD", "TEMPLATE_SELECT"],
  RESUME_UPLOAD: ["RESUME_REVIEW", "IDLE"],
  RESUME_REVIEW: ["RESUME_EDIT", "JD_UPLOAD", "IDLE"],
  RESUME_EDIT: ["RESUME_REVIEW", "JD_UPLOAD", "IDLE"],
  JD_UPLOAD: ["ATS_ANALYSIS", "IDLE"],
  ATS_ANALYSIS: ["CHANGE_APPROVAL", "IDLE"],
  CHANGE_APPROVAL: ["NEW_CONTENT", "ATS_ANALYSIS", "IDLE"],
  NEW_CONTENT: ["FINAL_REVIEW", "IDLE"],
  FINAL_REVIEW: ["IDLE", "JD_UPLOAD"],
  TEMPLATE_SELECT: ["RESUME_BUILD", "IDLE"],
  RESUME_BUILD: ["RESUME_REVIEW", "IDLE"],
  SKILLS_GAP: ["IDLE", "INTERVIEW_PREP"],
  INTERVIEW_PREP: ["IDLE"],
  COVER_LETTER: ["IDLE"],
};

/**
 * User-facing prompt for each state.
 */
export const STATE_PROMPTS: Record<ConversationState, string> = {
  IDLE: "What would you like to do? Choose an option below:",
  ONBOARDING: "Welcome to Rezumate! Let's get started. Do you have an existing resume?",
  RESUME_UPLOAD: "📄 Please upload your resume file (PDF or DOCX), or paste the text directly.",
  RESUME_REVIEW: "Here's what I extracted from your resume. Does everything look correct?",
  RESUME_EDIT: "Which section would you like to edit?",
  JD_UPLOAD: "📋 Now paste the job description you want to tailor your resume for:",
  ATS_ANALYSIS: "Analyzing your resume against the job description...",
  CHANGE_APPROVAL: "Here are the suggested changes. Would you like to approve them?",
  NEW_CONTENT: "Would you like to add any new projects, skills, or experiences before finalizing?",
  FINAL_REVIEW: "Here's your tailored resume. Would you like to accept it?",
  TEMPLATE_SELECT: "Choose a resume template to get started:",
  RESUME_BUILD: "Let's build your resume step by step. Starting with your personal information.",
  SKILLS_GAP: "I'll analyze the skills gap between your resume and the job requirements.",
  INTERVIEW_PREP: "Let me prepare some interview questions based on the role.",
  COVER_LETTER: "I'll generate a tailored cover letter for this position.",
};

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
  // IDLE is always reachable (cancel/reset)
  if (to === "IDLE") return true;
  // Starting/re-entering entry points for key flows is always allowed
  if (["RESUME_UPLOAD", "TEMPLATE_SELECT", "JD_UPLOAD"].includes(to)) return true;
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
