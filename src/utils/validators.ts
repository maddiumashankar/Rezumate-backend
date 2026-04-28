import type { ResumeContent } from "../types";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^[\d\s\-+()]{7,20}$/.test(phone);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateResumeContent(content: ResumeContent): string[] {
  const errors: string[] = [];

  if (!content.personal.fullName?.trim()) {
    errors.push("Full name is required");
  }
  if (!content.personal.email?.trim()) {
    errors.push("Email is required");
  } else if (!isValidEmail(content.personal.email)) {
    errors.push("Invalid email format");
  }
  if (content.experience.length === 0 && content.education.length === 0) {
    errors.push("At least one experience or education entry is required");
  }
  if (content.skills.length === 0) {
    errors.push("At least one skill category is recommended");
  }

  return errors;
}

export function sanitizeText(text: string): string {
  return text.replace(/[<>]/g, "").trim();
}

export function isFileSizeValid(sizeBytes: number, maxMB: number = 10): boolean {
  return sizeBytes <= maxMB * 1024 * 1024;
}

export function isSupportedFileType(mimeType: string): boolean {
  const supported = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
  ];
  return supported.includes(mimeType);
}
