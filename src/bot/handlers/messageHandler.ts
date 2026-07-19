import type { Context } from "telegraf";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { jdService } from "../../services/jdService";
import { userRepo } from "../../database/repos/userRepository";
import { jdRepo } from "../../database/repos/jdRepository";
import { tailorResume } from "../../agents/resumeTailorAgent";
import { enhancedATSScore } from "../../agents/atsScorer";
import { analyzeSkillsGap, formatSkillsGap } from "../../agents/skillsAnalyzer";
import { generateResumeAssessment, editResumeWithAI } from "../../agents/resumeEditorAgent";
import { generateResumePDF } from "../../services/pdfService";
import { formatResumeSummary, formatATSScore, formatTailoringChanges, replyInChunks, markdownToHtml } from "../../utils/formatters";
import { callLLM, parseJsonFromResponse } from "../../services/llmService";
import logger from "../../utils/logger";
import path from "path";
import fs from "fs";

interface IntentClassification {
  intent: "ATS_SCORE" | "OPTIMIZE_RESUME" | "SKILLS_GAP" | "EDIT_RESUME" | "CAREER_GUIDANCE_OR_RESOURCES" | "EXPORT_PDF" | "GENERAL_CHAT";
  hasJobDescription: boolean;
  extractedJobDescription?: string;
  hasResumeText: boolean;
  extractedResumeText?: string;
  explanation: string;
}

/**
 * Handle plain text messages dynamically and agentically.
 */
export async function handleMessage(ctx: Context): Promise<void> {
  if (!ctx.message || !("text" in ctx.message)) return;
  const text = ctx.message.text;
  const telegramId = ctx.from?.id;
  if (!telegramId || text.startsWith("/")) return; // Ignore commands

  try {
    const user = await userRepo.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Please use /start first to set up your account.");
      return;
    }

    const session = await conversationMachine.getSession(user.id);
    const pendingAction = session.stateData?.pendingAction;

    // ---- Case A: Waiting for specific conversational context ----
    if (pendingAction === "CONFIRM_PDF_NAME") {
      const suggestions = session.stateData?.suggestions || [];
      let chosenFilename = "";
      const normalizedText = text.trim();

      if (normalizedText === "1" && suggestions[0]) {
        chosenFilename = suggestions[0];
      } else if (normalizedText === "2" && suggestions[1]) {
        chosenFilename = suggestions[1];
      } else if (normalizedText === "3" && suggestions[2]) {
        chosenFilename = suggestions[2];
      } else {
        let customName = normalizedText.replace(/\s+/g, "_");
        if (!customName.toLowerCase().endsWith(".pdf")) {
          customName += ".pdf";
        }
        chosenFilename = customName;
      }

      await ctx.reply(markdownToHtml(`📐 *Compiling your resume PDF as ${chosenFilename}...*`), { parse_mode: "HTML" });

      const resume = await resumeService.getLatest(user.id);
      if (!resume) {
        await ctx.reply("❌ Resume profile not found. Please upload a resume first.");
        await conversationMachine.reset(session.id);
        return;
      }

      const pdfPath = path.join(process.cwd(), "data", "pdfs", `${user.id}_tailored.pdf`);
      await generateResumePDF(resume.contentJson, pdfPath);

      if (fs.existsSync(pdfPath)) {
        await ctx.replyWithDocument({ source: pdfPath, filename: chosenFilename });
        await ctx.reply("Here is your PDF resume!");
      } else {
        await ctx.reply("❌ Error compiling PDF. Please try again.");
      }

      // Reset pending action but keep resume/jd cached
      await conversationMachine.updateStateData(session.id, {
        ...session.stateData,
        pendingAction: null,
        suggestions: null,
      });
      return;
    }

    if (pendingAction === "EXPORT_PDF" && session.currentState === "RESUME_UPLOAD") {
      const isWordy = text.split(/\s+/).length > 4;
      if (text.length < 40 && !isWordy) {
        const suggestions = session.stateData?.suggestions || ["My_Resume.pdf", "Draft_Resume.pdf", "Standard_CV.pdf"];
        let chosenFilename = "";
        const normalizedText = text.trim();

        if (normalizedText === "1" && suggestions[0]) {
          chosenFilename = suggestions[0];
        } else if (normalizedText === "2" && suggestions[1]) {
          chosenFilename = suggestions[1];
        } else if (normalizedText === "3" && suggestions[2]) {
          chosenFilename = suggestions[2];
        } else {
          let customName = normalizedText.replace(/\s+/g, "_");
          if (!customName.toLowerCase().endsWith(".pdf")) {
            customName += ".pdf";
          }
          chosenFilename = customName;
        }

        await conversationMachine.updateStateData(session.id, {
          ...session.stateData,
          futurePdfName: chosenFilename,
        });

        await ctx.reply(markdownToHtml(`📝 *Future filename saved:* I will export your resume as **${chosenFilename}** once details are uploaded.\n\nNow, please upload your resume file (PDF or DOCX) or paste it here to begin:`), { parse_mode: "HTML" });
        return;
      }
    }

    if (session.currentState === "RESUME_UPLOAD") {
      // User is explicitly pasting resume
      if (text.length < 50) {
        await ctx.reply("That seems too short for a resume. Please paste the full resume text or upload a PDF/DOCX file.");
        return;
      }
      await ctx.reply("🧠 Parsing pasted resume text...");
      const resume = await resumeService.createFromText(user.id, text);
      const nextStateData = { ...session.stateData, resumeId: resume.id };
      await conversationMachine.updateStateData(session.id, nextStateData);
      
      const assessment = await generateResumeAssessment(resume.contentJson);
      const summary = formatResumeSummary(resume.contentJson);
      await replyInChunks(ctx, markdownToHtml(`✅ *Resume parsed successfully!*\n\n${assessment}\n\n---\n${summary}`), { parse_mode: "HTML" });
      
      // If there was a pending action, resume it
      if (pendingAction) {
        await conversationMachine.updateStateData(session.id, { ...nextStateData, pendingAction: null });
        await executePendingAction(ctx, user.id, session.id, pendingAction, nextStateData);
      } else {
        await conversationMachine.reset(session.id);
        await ctx.reply("What would you like me to do with this resume?");
      }
      return;
    }

    if (session.currentState === "JD_UPLOAD") {
      // User is explicitly pasting Job Description
      if (text.length < 30) {
        await ctx.reply("That seems too short for a job description. Please paste the full job description details.");
        return;
      }
      await ctx.reply("📋 Analyzing job description...");
      const jd = await jdService.parseAndStore(user.id, text);
      const nextStateData = { ...session.stateData, jdId: jd.id };
      await conversationMachine.updateStateData(session.id, nextStateData);
      
      await ctx.reply(`✅ *Job Description parsed:* "${jd.jobTitle}" at ${jd.companyName}.`);
      
      if (pendingAction) {
        await conversationMachine.updateStateData(session.id, { ...nextStateData, pendingAction: null });
        await executePendingAction(ctx, user.id, session.id, pendingAction, nextStateData);
      } else {
        await conversationMachine.reset(session.id);
        await ctx.reply("What action would you like to run now?");
      }
      return;
    }

    // ---- Case B: Normal flow — Classify User Intent ----
    await ctx.sendChatAction("typing");
    const classification = await classifyIntent(text);
    logger.info(`Classified user query: "${text.substring(0, 40)}..." -> ${classification.intent} (${classification.explanation})`);

    // Extract inline resume or JD if provided in message
    let activeResumeId = session.stateData?.resumeId;
    let activeJdId = session.stateData?.jdId;

    if (classification.hasResumeText && classification.extractedResumeText) {
      await ctx.reply("📄 *Pasted Resume Detected:* Parsing content...");
      const resume = await resumeService.createFromText(user.id, classification.extractedResumeText);
      activeResumeId = resume.id;
      await conversationMachine.updateStateData(session.id, { resumeId: resume.id });
    }

    if (classification.hasJobDescription && classification.extractedJobDescription) {
      await ctx.reply("📋 *Pasted Job Description Detected:* Analyzing requirements...");
      const jd = await jdService.parseAndStore(user.id, classification.extractedJobDescription);
      activeJdId = jd.id;
      await conversationMachine.updateStateData(session.id, { jdId: jd.id });
      await ctx.reply(`✅ Job Description saved: "${jd.jobTitle}" at ${jd.companyName}.`);
    }

    // Dispatch intent
    switch (classification.intent) {
      case "ATS_SCORE":
        await handleAtsScoreAction(ctx, user.id, session.id, activeResumeId, activeJdId, text);
        break;

      case "OPTIMIZE_RESUME":
        await handleOptimizeResumeAction(ctx, user.id, session.id, activeResumeId, activeJdId, text);
        break;

      case "SKILLS_GAP":
        await handleSkillsGapAction(ctx, user.id, session.id, activeResumeId, activeJdId, text);
        break;

      case "EDIT_RESUME":
        await handleEditResumeAction(ctx, user.id, session.id, activeResumeId, text);
        break;

      case "CAREER_GUIDANCE_OR_RESOURCES":
        await handleCareerGuidanceAction(ctx, user.id, text, activeJdId);
        break;

      case "EXPORT_PDF":
        await handleExportPdfAction(ctx, user.id, session.id, activeResumeId);
        break;

      case "GENERAL_CHAT":
      default:
        await handleGeneralChatAction(ctx, user.id, text);
        break;
    }
  } catch (err: any) {
    logger.error(`Message handler error: ${err.message}`);
    await ctx.reply(`❌ Error processing your request: ${err.message}\nUse /cancel to clear state.`);
  }
}

// ─── Intent Classifier ──────────────────────────────────────────────────────

async function classifyIntent(text: string): Promise<IntentClassification> {
  const systemPrompt = `You are a conversational intent classifier for Rezumate, a career assistant bot.
Analyze the user's message and categorize their query into exactly one of these intents:
- "ATS_SCORE": User wants to get their resume's ATS compatibility score against a job description.
- "OPTIMIZE_RESUME": User wants to tailor, optimize, align, or rewrite their resume for a job description.
- "SKILLS_GAP": User wants to analyze missing skills, skill matching, or run a skills gap report against a JD.
- "EDIT_RESUME": User wants to edit, update, add, delete, or modify content, section details, or bullets in their resume (e.g. "add React project", "edit Google bullets", "change email"). Do NOT classify simple questions asking to view, read, list, or summarize profile contents under EDIT_RESUME.
- "CAREER_GUIDANCE_OR_RESOURCES": User is asking for learning links, technical roadmaps, books, websites, prep strategies, career advice, or mock interview questions (independent of resume).
- "EXPORT_PDF": User wants to download, export, generate, or receive their resume as a PDF file (e.g., "send me the pdf", "generate PDF", "download resume", "export resume").
- "GENERAL_CHAT": Standard chit-chat, greetings, conversational remarks, or questions asking to view, read, list, or summarize the contents of their current resume profile (e.g. "what is my experience?", "list my skills", "what projects do I have?").

Also check if they pasted a job description or resume directly within the message. If a large block of text describes a job title, duties, or requirements, set hasJobDescription to true and extract it. If it lists a person's complete contact, skills, or experience entries, set hasResumeText to true and extract it.

Return ONLY a JSON object matching this schema:
{
  "intent": "ATS_SCORE" | "OPTIMIZE_RESUME" | "SKILLS_GAP" | "EDIT_RESUME" | "CAREER_GUIDANCE_OR_RESOURCES" | "EXPORT_PDF" | "GENERAL_CHAT",
  "hasJobDescription": boolean,
  "extractedJobDescription": "string (the full text of the job description if pasted in the message, otherwise empty)",
  "hasResumeText": boolean,
  "extractedResumeText": "string (the full text of the resume if pasted in the message, otherwise empty)",
  "explanation": "brief reasoning"
}

Do not include markdown packaging (no \`\`\`json wrappers), just output the raw JSON string.`;

  try {
    const response = await callLLM(`User message: "${text}"`, systemPrompt, 2048);
    const parsed = parseJsonFromResponse<IntentClassification>(response.text);
    if (parsed) return parsed;
  } catch (err: any) {
    logger.error(`Classification failure: ${err.message}`);
  }
  return { intent: "GENERAL_CHAT", hasJobDescription: false, hasResumeText: false, explanation: "Fallback to general" };
}

// ─── Dispatch Action Handlers ───────────────────────────────────────────────

async function handleAtsScoreAction(
  ctx: Context,
  userId: string,
  sessionId: string,
  resumeId?: string,
  jdId?: string,
  originalMessage?: string
): Promise<void> {
  const resume = resumeId ? await resumeService.getById(resumeId) : await resumeService.getLatest(userId);
  if (!resume) {
    await conversationMachine.transition(sessionId, "IDLE", "RESUME_UPLOAD", { pendingAction: "ATS_SCORE", originalMessage });
    await ctx.reply("📄 I need your resume first before I can score it. Please upload your resume file (PDF or DOCX) or paste it as text.");
    return;
  }

  const jd = jdId ? await jdService.getById(jdId) : await jdRepo.findByUser(userId).then(rows => rows[0]);
  if (!jd) {
    await conversationMachine.transition(sessionId, "IDLE", "JD_UPLOAD", { pendingAction: "ATS_SCORE", resumeId: resume.id, originalMessage });
    await ctx.reply("📋 Job Description needed! Please paste the job description you want to score your resume against.");
    return;
  }

  await ctx.reply("📊 Calculating ATS compatibility score...");
  const atsScore = await enhancedATSScore(resume.contentJson, jd.keywordAnalysis);
  const atsFormatted = formatATSScore(atsScore);
  await replyInChunks(ctx, markdownToHtml(atsFormatted), { parse_mode: "HTML" });
}

async function handleOptimizeResumeAction(
  ctx: Context,
  userId: string,
  sessionId: string,
  resumeId?: string,
  jdId?: string,
  originalMessage?: string
): Promise<void> {
  const resume = resumeId ? await resumeService.getById(resumeId) : await resumeService.getLatest(userId);
  if (!resume) {
    await conversationMachine.transition(sessionId, "IDLE", "RESUME_UPLOAD", { pendingAction: "OPTIMIZE_RESUME", originalMessage });
    await ctx.reply("📄 I need your resume first. Please upload your resume file (PDF or DOCX) or paste it here.");
    return;
  }

  const jd = jdId ? await jdService.getById(jdId) : await jdRepo.findByUser(userId).then(rows => rows[0]);
  if (!jd) {
    await conversationMachine.transition(sessionId, "IDLE", "JD_UPLOAD", { pendingAction: "OPTIMIZE_RESUME", resumeId: resume.id, originalMessage });
    await ctx.reply("📋 Job description is required to optimize. Please paste the job details now:");
    return;
  }

  await ctx.reply(markdownToHtml("✨ *Optimizing your resume...* This may take a minute as I align it with the job requirements."), { parse_mode: "HTML" });
  const tailorResult = await tailorResume(resume.contentJson, jd.content, jd.keywordAnalysis);
  
  await resumeService.applyTailoredChanges(
    resume.id,
    tailorResult.tailoredContent,
    tailorResult.changesSummary,
    tailorResult.scoreBefore,
    tailorResult.scoreAfter,
    jd.id
  );

  const changesFormatted = formatTailoringChanges(tailorResult.changes);
  await replyInChunks(ctx, markdownToHtml(`📝 *Suggested Changes Applied:*\n\n${changesFormatted}`), { parse_mode: "HTML" });
  await ctx.reply(markdownToHtml(`📊 *Score Improved:* ${tailorResult.scoreBefore} → ${tailorResult.scoreAfter} (+${tailorResult.scoreAfter - tailorResult.scoreBefore})`), { parse_mode: "HTML" });

  await ctx.reply("📐 Compiling tailored resume PDF...");
  const pdfPath = path.join(process.cwd(), "data", "pdfs", `${userId}_tailored.pdf`);
  await generateResumePDF(tailorResult.tailoredContent, pdfPath);
  
  if (fs.existsSync(pdfPath)) {
    const user = await userRepo.findById(userId);
    await ctx.replyWithDocument({ source: pdfPath, filename: `${user?.firstName || "optimized"}_resume.pdf` });
    await ctx.reply("Here is your optimized PDF resume!");
  } else {
    await ctx.reply("❌ Error generating PDF file, but changes have been successfully applied to your profile dataset.");
  }
}

async function handleSkillsGapAction(
  ctx: Context,
  userId: string,
  sessionId: string,
  resumeId?: string,
  jdId?: string,
  originalMessage?: string
): Promise<void> {
  const resume = resumeId ? await resumeService.getById(resumeId) : await resumeService.getLatest(userId);
  if (!resume) {
    await conversationMachine.transition(sessionId, "IDLE", "RESUME_UPLOAD", { pendingAction: "SKILLS_GAP", originalMessage });
    await ctx.reply("📄 Resume needed! Please upload your resume file (PDF or DOCX) or paste it as text.");
    return;
  }

  const jd = jdId ? await jdService.getById(jdId) : await jdRepo.findByUser(userId).then(rows => rows[0]);
  if (!jd) {
    await conversationMachine.transition(sessionId, "IDLE", "JD_UPLOAD", { pendingAction: "SKILLS_GAP", resumeId: resume.id, originalMessage });
    await ctx.reply("📋 Job description needed for skills gap check. Please paste the JD details:");
    return;
  }

  await ctx.reply("🔍 Running skills gap analysis...");
  const result = await analyzeSkillsGap(resume.contentJson, jd.keywordAnalysis);
  const formatted = formatSkillsGap(result);
  await replyInChunks(ctx, markdownToHtml(formatted), { parse_mode: "HTML" });
}

async function handleEditResumeAction(
  ctx: Context,
  userId: string,
  sessionId: string,
  resumeId?: string,
  instruction?: string
): Promise<void> {
  const resume = resumeId ? await resumeService.getById(resumeId) : await resumeService.getLatest(userId);
  if (!resume) {
    await conversationMachine.transition(sessionId, "IDLE", "RESUME_UPLOAD", { pendingAction: "EDIT_RESUME", originalMessage: instruction });
    await ctx.reply("📄 Please upload your resume first so I know what details to modify.");
    return;
  }

  if (!instruction) {
    await ctx.reply("What details would you like to edit or add? (e.g. \"add python, fastapi to skills\", \"change email to me@example.com\")");
    return;
  }

  await ctx.reply("🧠 Processing edits on your resume profile...");
  const { updatedResume, changeSummary } = await editResumeWithAI(resume.contentJson, instruction);
  
  const isChanged = JSON.stringify(resume.contentJson) !== JSON.stringify(updatedResume);
  
  if (isChanged) {
    await resumeService.updateWholeContent(resume.id, updatedResume);
    await ctx.reply(
      markdownToHtml(`✨ *Updated details successfully:* ${changeSummary}\n\n` +
        `Would you like to make more edits, check your ATS score, or type *"generate PDF"* to compile and download your updated resume now?`),
      { parse_mode: "HTML" }
    );
  } else {
    await ctx.reply(
      markdownToHtml(`ℹ️ *No changes were made to your resume content:* ${changeSummary}\n\n` +
        `Let me know if there's anything else you'd like to update, or type *"generate PDF"* to download your current resume.`),
      { parse_mode: "HTML" }
    );
  }
}

async function handleCareerGuidanceAction(ctx: Context, userId: string, query: string, jdId?: string): Promise<void> {
  await ctx.sendChatAction("typing");
  const resume = await resumeService.getLatest(userId);
  const jd = jdId ? await jdService.getById(jdId) : await jdRepo.findByUser(userId).then(rows => rows[0]);

  let prompt = `You are Rezumate, a helpful and warm AI Career Coach.
The user is asking for career guidance, technical resources, prep strategies, learning links, roadmaps, or guidance on job searching.
User query: "${query}"

`;
  if (jd) {
    prompt += `Target Job Details:
Title: ${jd.jobTitle} at ${jd.companyName}
JD Context: ${jd.content.substring(0, 800)}

`;
  }
  if (resume) {
    prompt += `Candidate current resume JSON context:
${JSON.stringify(resume.contentJson, null, 2)}

`;
  }

  prompt += `Provide a comprehensive, professional, and practical response:
1. Outline learning resources (e.g. official docs, popular online portals, key books, recommended frameworks).
2. Detail preparation strategies and roadmaps.
3. Suggest top skill focus areas that match their queries.
Use markdown bullets, headers, and bold text for visual structure.`;

  try {
    const response = await callLLM(prompt, "You are a warm, collaborative AI career agent.", 2048);
    await replyInChunks(ctx, markdownToHtml(response.text.trim()), { parse_mode: "HTML" });
  } catch (err: any) {
    logger.error(`Career advice error: ${err.message}`);
    await ctx.reply("❌ Sorry, I had trouble compiling resources. Focus on official frameworks, build solid projects, and review standard mock questions. What else can I guide you with?");
  }
}

async function handleGeneralChatAction(ctx: Context, userId: string, text: string): Promise<void> {
  await ctx.sendChatAction("typing");
  const resume = await resumeService.getLatest(userId);

  let prompt = `You are Rezumate, a warm, conversational AI Career Agent.
Candidate chat query: "${text}"

`;
  if (resume) {
    prompt += `Candidate Profile JSON:
${JSON.stringify(resume.contentJson, null, 2)}

`;
  }

  prompt += `Answer the candidate conversationally. If they ask about their profile (e.g. their experiences, education, skills, projects, etc.), answer them fully by reading the Candidate Profile JSON. Otherwise, invite them to test features like checking ATS score, running skills gap check, optimizing resume against a job description, or asking for roadmaps/career resources.`;

  try {
    const response = await callLLM(prompt, "You are a warm, collaborative AI career agent.", 1024);
    await replyInChunks(ctx, markdownToHtml(response.text.trim()), { parse_mode: "HTML" });
  } catch (err: any) {
    await ctx.reply("Hello! I am Rezumate, your AI Career Agent. Let me know if you would like to analyze your resume, optimize it against a JD, check skills gaps, or get learning links!");
  }
}

async function executePendingAction(ctx: Context, userId: string, sessionId: string, action: string, stateData: Record<string, any>): Promise<void> {
  const text = stateData.originalMessage || "";
  const resumeId = stateData.resumeId;
  const jdId = stateData.jdId;

  switch (action) {
    case "ATS_SCORE":
      await handleAtsScoreAction(ctx, userId, sessionId, resumeId, jdId, text);
      break;
    case "OPTIMIZE_RESUME":
      await handleOptimizeResumeAction(ctx, userId, sessionId, resumeId, jdId, text);
      break;
    case "SKILLS_GAP":
      await handleSkillsGapAction(ctx, userId, sessionId, resumeId, jdId, text);
      break;
    case "EDIT_RESUME":
      await handleEditResumeAction(ctx, userId, sessionId, resumeId, text);
      break;
    case "EXPORT_PDF":
      await handleExportPdfAction(ctx, userId, sessionId, resumeId);
      break;
  }
}

async function handleExportPdfAction(
  ctx: Context,
  userId: string,
  sessionId: string,
  resumeId?: string
): Promise<void> {
  const resume = resumeId ? await resumeService.getById(resumeId) : await resumeService.getLatest(userId);
  if (!resume) {
    const suggestions = ["My_Resume.pdf", "Draft_Resume.pdf", "Standard_CV.pdf"];
    await conversationMachine.transition(sessionId, "IDLE", "RESUME_UPLOAD", {
      pendingAction: "EXPORT_PDF",
      suggestions,
    });

    const msg = `📄 *You don't have a resume profile yet.* Please upload your resume file (PDF or DOCX) or paste it here to get started.\n\n` +
      `For your future PDF exports, what filename would you prefer? Here are some suggestions:\n` +
      `1. **My_Resume.pdf**\n` +
      `2. **Draft_Resume.pdf**\n` +
      `3. **Standard_CV.pdf**\n\n` +
      `You can type the number, a custom name, or simply upload your resume!`;
    await ctx.reply(markdownToHtml(msg), { parse_mode: "HTML" });
    return;
  }

  const session = await conversationMachine.getSession(userId);
  const futurePdfName = session.stateData?.futurePdfName;

  if (futurePdfName) {
    await ctx.reply(markdownToHtml(`📐 *Compiling your resume PDF as ${futurePdfName}...*`), { parse_mode: "HTML" });
    const pdfPath = path.join(process.cwd(), "data", "pdfs", `${userId}_tailored.pdf`);
    await generateResumePDF(resume.contentJson, pdfPath);

    if (fs.existsSync(pdfPath)) {
      await ctx.replyWithDocument({ source: pdfPath, filename: futurePdfName });
      await ctx.reply("Here is your PDF resume!");
    } else {
      await ctx.reply("❌ Error compiling PDF. Please try again.");
    }

    await conversationMachine.updateStateData(sessionId, {
      ...session.stateData,
      futurePdfName: null,
    });
    return;
  }

  const personal = resume.contentJson.personal || {};
  const fullName = personal.fullName || "";
  const title = personal.title || "Developer";

  let cleanBase = fullName.trim().replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
  if (!cleanBase) {
    cleanBase = "My";
  }
  const cleanTitle = title.trim().replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

  const s1 = `${cleanBase}_Resume.pdf`;
  const s2 = `${cleanBase}_CV.pdf`;
  const s3 = `${cleanBase}_${cleanTitle}_Resume.pdf`;

  const suggestions = [s1, s2, s3];
  await conversationMachine.updateStateData(sessionId, {
    ...session.stateData,
    pendingAction: "CONFIRM_PDF_NAME",
    suggestions,
  });

  const msg = `📐 *I am ready to compile your PDF resume!*\n\n` +
    `What would you like to name the PDF file? Here are some suggestions:\n` +
    `1. **${s1}**\n` +
    `2. **${s2}**\n` +
    `3. **${s3}**\n\n` +
    `Please type the number (**1**, **2**, or **3**) or reply with your own custom filename (e.g. *My_Custom_CV.pdf*).`;
  await ctx.reply(markdownToHtml(msg), { parse_mode: "HTML" });
}
