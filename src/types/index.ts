// ============================================================
// REZUMATE - Core Type Definitions
// ============================================================

// ---- User Types ----
export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface UserPreferences {
  language: "en" | "es" | "fr" | "hi";
  resumeFormat: "pdf" | "docx";
  notificationsEnabled: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  resumeFormat: "pdf",
  notificationsEnabled: true,
};

// ---- Resume Types ----
export interface Resume {
  id: string;
  userId: string;
  versionNumber: number;
  title: string;
  contentJson: ResumeContent;
  parsedFrom: "manual" | "upload" | "ai_generated" | "template";
  uploadedFileName: string | null;
  atsScore: number | null;
  linkedToJdId: string | null;
  isActive: boolean;
  metadata: ResumeMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeContent {
  personal: PersonalInfo;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: SkillCategory[];
  certifications: Certification[];
  projects: Project[];
  languages: LanguageEntry[];
  customSections: CustomSection[];
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  github: string;
  portfolio: string;
  title: string;
}

export interface Experience {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  bullets: string[];
  technologies: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string | null;
  highlights: string[];
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
  expiryDate: string | null;
  credentialId: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url: string | null;
  bullets: string[];
}

export interface LanguageEntry {
  language: string;
  proficiency: "native" | "fluent" | "advanced" | "intermediate" | "basic";
}

export interface CustomSection {
  title: string;
  items: string[];
}

export interface ResumeMetadata {
  skills: string[];
  experienceYears: number;
  educationLevel: string;
  industries: string[];
  totalBulletPoints: number;
}

// ---- Job Description Types ----
export interface JobDescription {
  id: string;
  userId: string;
  companyName: string;
  jobTitle: string;
  content: string;
  sourceUrl: string | null;
  keywordAnalysis: JDKeywordAnalysis;
  createdAt: string;
}

export interface JDKeywordAnalysis {
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  experienceLevel: string;
  educationRequirement: string;
  responsibilities: string[];
  industry: string;
}

// ---- Resume Version Types ----
export interface ResumeVersion {
  id: string;
  resumeId: string;
  versionNumber: number;
  changesSummary: string;
  atsScoreBefore: number | null;
  atsScoreAfter: number | null;
  generatedForJdId: string | null;
  contentSnapshot: ResumeContent;
  createdAt: string;
  approvedAt: string | null;
}

// ---- ATS Score Types ----
export interface ATSScore {
  overallScore: number; // 0-100
  breakdown: ATSBreakdown;
  suggestions: ATSSuggestion[];
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface ATSBreakdown {
  keywordMatch: number;
  formatScore: number;
  experienceRelevance: number;
  educationAlignment: number;
  sectionCompleteness: number;
  bulletQuality: number;
}

export interface ATSSuggestion {
  section: string;
  priority: "high" | "medium" | "low";
  suggestion: string;
  impact: string;
}

// ---- Conversation State Machine Types ----
export type ConversationState =
  | "IDLE"
  | "ONBOARDING"
  | "RESUME_UPLOAD"
  | "RESUME_REVIEW"
  | "RESUME_EDIT"
  | "JD_UPLOAD"
  | "ATS_ANALYSIS"
  | "CHANGE_APPROVAL"
  | "NEW_CONTENT"
  | "FINAL_REVIEW"
  | "TEMPLATE_SELECT"
  | "RESUME_BUILD"
  | "SKILLS_GAP"
  | "INTERVIEW_PREP"
  | "COVER_LETTER";

export interface ConversationSession {
  id: string;
  userId: string;
  currentState: ConversationState;
  stateData: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- State Data Contexts ----
export interface ResumeTailorStateData {
  resumeId?: string;
  jdId?: string;
  currentAtsScore?: ATSScore;
  suggestedChanges?: TailoringChange[];
  approvedChanges?: string[];
  newContentCollected?: Record<string, any>;
}

export interface TailoringChange {
  id: string;
  section: string;
  originalContent: string;
  suggestedContent: string;
  reason: string;
  impactOnScore: number;
}

// ---- Agent Types ----
export interface AgentToolCall {
  name: string;
  input: Record<string, any>;
}

export interface AgentResponse {
  success: boolean;
  data?: any;
  message: string;
  tokensUsed?: { input: number; output: number };
}

// ---- Template Types ----
export interface ResumeTemplate {
  id: string;
  name: string;
  category: "entry_level" | "mid_level" | "senior" | "executive";
  industry: string | null;
  description: string;
  content: ResumeContent;
}

// ---- Job Application Types ----
export interface JobApplication {
  id: string;
  userId: string;
  jdId: string;
  resumeId: string;
  status: "draft" | "applied" | "rejected" | "shortlisted" | "interview" | "offer";
  applicationDate: string | null;
  notes: string;
  atsScore: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Telegram Callback Data ----
export type CallbackAction =
  | "resume_train"
  | "my_resume"
  | "templates"
  | "skills_gap"
  | "interview_prep"
  | "cover_letter"
  | "help"
  | "approve_changes"
  | "reject_changes"
  | "skip_new_content"
  | "add_new_content"
  | "accept_final"
  | "reject_final"
  | "edit_section"
  | "delete_section"
  | "cancel";

export interface CallbackData {
  action: CallbackAction;
  data?: string;
}

// ---- Utility Types ----
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createEmptyResumeContent(): ResumeContent {
  return {
    personal: {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      linkedIn: "",
      github: "",
      portfolio: "",
      title: "",
    },
    summary: "",
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    languages: [],
    customSections: [],
  };
}
