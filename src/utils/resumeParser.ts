import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import logger from "./logger";
import type { ResumeContent } from "../types";
import { createEmptyResumeContent } from "../types";
import { callLLM, parseJsonFromResponse } from "../services/llmService";

/**
 * Parse a resume file (PDF or DOCX) into structured ResumeContent.
 */
export async function parseResumeFile(filePath: string): Promise<ResumeContent> {
  const ext = path.extname(filePath).toLowerCase();
  let rawText = "";

  if (ext === ".pdf") {
    rawText = await extractTextFromPDF(filePath);
  } else if (ext === ".docx") {
    rawText = await extractTextFromDOCX(filePath);
  } else if (ext === ".txt") {
    rawText = fs.readFileSync(filePath, "utf-8");
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  if (!rawText.trim()) {
    throw new Error("Could not extract any text from the file");
  }

  return parseResumeText(rawText);
}

/**
 * Parse raw resume text into structured ResumeContent using the LLM.
 */
export async function parseResumeText(text: string): Promise<ResumeContent> {
  const systemPrompt = `You are an expert resume parser. Extract structured data from the resume text.
Return a JSON object matching this EXACT structure (no extra fields):

{
  "personal": {
    "fullName": "", "email": "", "phone": "", "location": "",
    "linkedIn": "", "github": "", "portfolio": "", "title": ""
  },
  "summary": "",
  "experience": [
    {
      "id": "exp_1",
      "company": "", "title": "", "location": "",
      "startDate": "YYYY-MM", "endDate": "YYYY-MM or null",
      "isCurrent": false,
      "bullets": ["..."],
      "technologies": ["..."]
    }
  ],
  "education": [
    {
      "id": "edu_1",
      "institution": "", "degree": "", "field": "",
      "startDate": "YYYY-MM", "endDate": "YYYY-MM",
      "gpa": null, "highlights": []
    }
  ],
  "skills": [
    { "category": "Programming Languages", "skills": ["Python", "JavaScript"] }
  ],
  "certifications": [],
  "projects": [],
  "languages": [],
  "customSections": []
}

Rules:
- Extract ALL information from the text
- Use date format YYYY-MM (e.g., "2023-01")
- If a date is "Present" or "Current", set endDate to null and isCurrent to true
- Group skills into meaningful categories
- Extract technologies mentioned in experience bullets
- Generate unique ids for experience (exp_1, exp_2) and education (edu_1, edu_2)
- Return ONLY valid JSON, no explanations`;

  const response = await callLLM(
    `Parse this resume and return structured JSON:\n\n${text}`,
    systemPrompt,
    4096
  );

  const parsed = parseJsonFromResponse<ResumeContent>(response.text);
  if (!parsed) {
    logger.error("Failed to parse resume from LLM response");
    throw new Error("Failed to parse resume. Please try uploading again.");
  }

  // Ensure all required fields exist
  const content = { ...createEmptyResumeContent(), ...parsed };
  return content;
}

async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err: any) {
    logger.error(`PDF extraction failed: ${err.message}`);
    throw new Error("Failed to extract text from PDF. Please ensure the file is not corrupted.");
  }
}

async function extractTextFromDOCX(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (err: any) {
    logger.error(`DOCX extraction failed: ${err.message}`);
    throw new Error("Failed to extract text from DOCX file.");
  }
}
