import type { Context } from "telegraf";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { jdService } from "../../services/jdService";
import { userRepo } from "../../database/repos/userRepository";
import { tailorResume } from "../../agents/resumeTailorAgent";
import { enhancedATSScore } from "../../agents/atsScorer";
import { analyzeSkillsGap, formatSkillsGap } from "../../agents/skillsAnalyzer";
import { generateCoverLetter } from "../../agents/coverLetterAgent";
import { generateResumeAssessment, editResumeWithAI } from "../../agents/resumeEditorAgent";
import { generateInterviewPrep, formatInterviewPrep } from "../../agents/interviewPrepAgent";
import { mainMenu, resumeReviewOptions, changeApprovalOptions } from "../keyboards";
import { formatResumeSummary, formatATSScore, formatTailoringChanges, replyInChunks } from "../../utils/formatters";
import { callLLM } from "../../services/llmService";
import logger from "../../utils/logger";

/**
 * Handle plain text messages based on conversation state.
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

    switch (session.currentState) {
      case "IDLE":
        await handleIdleConversation(ctx, user.id, session, text);
        break;

      case "RESUME_UPLOAD":
        await handleResumeTextInput(ctx, user.id, session, text);
        break;

      case "JD_UPLOAD":
        await handleJDInput(ctx, user.id, session, text);
        break;

      case "NEW_CONTENT":
        await handleNewContentInput(ctx, user.id, session, text);
        break;

      case "RESUME_REVIEW":
      case "RESUME_EDIT":
        await handleConversationalEdit(ctx, user.id, session, text);
        break;

      case "RESUME_BUILD":
        await handleBuildInput(ctx, user.id, session, text);
        break;

      default:
        await ctx.reply("I wasn't expecting text right now. You can type /menu to see options or ask me anything!");
        break;
    }
  } catch (err: any) {
    logger.error(`Message handler error: ${err.message}`);
    await ctx.reply(`❌ Error: ${err.message}\nPlease try again. (You can type /menu to see the menu)`);
  }
}

// ---- State-specific handlers ----

async function handleResumeTextInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  if (text.length < 50) {
    await ctx.reply("That seems too short for a resume. Please paste the full resume text, or upload a PDF/DOCX file.");
    return;
  }

  await ctx.reply("🧠 Parsing your resume and generating an assessment...");
  const resume = await resumeService.createFromText(userId, text);

  await conversationMachine.transition(session.id, "RESUME_UPLOAD", "RESUME_REVIEW", { resumeId: resume.id });

  const assessment = await generateResumeAssessment(resume.contentJson);
  const summary = formatResumeSummary(resume.contentJson);
  await replyInChunks(ctx, `${assessment}\n\n---\n${summary}`, { parse_mode: "Markdown" });
  await ctx.reply("Does this sound like you? You can reply directly in chat to ask me to modify any part of it, or click below to proceed.", resumeReviewOptions());
}

async function handleJDInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  if (text.length < 30) {
    await ctx.reply("That seems too short for a job description. Please paste the full JD text.");
    return;
  }

  await ctx.reply("📋 Analyzing the job description...");
  const jd = await jdService.parseAndStore(userId, text);

  const resumeId = session.stateData?.resumeId;
  const nextAction = session.stateData?.nextAction;

  if (!resumeId) {
    await ctx.reply("No resume found. Please upload a resume first.", mainMenu());
    return;
  }

  const resume = await resumeService.getById(resumeId);
  if (!resume) {
    await ctx.reply("Resume not found. Please start over.", mainMenu());
    return;
  }

  // Handle different next actions (skills_gap, cover_letter, or default ATS analysis)
  if (nextAction === "skills_gap") {
    const result = await analyzeSkillsGap(resume.contentJson, jd.keywordAnalysis);
    const formatted = formatSkillsGap(result);
    await replyInChunks(ctx, formatted, { parse_mode: "Markdown" });
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next? You can ask me to generate a cover letter, do interview prep, or type /menu.");
    return;
  }

  if (nextAction === "cover_letter") {
    await ctx.reply("✉️ Generating your cover letter...");
    const coverLetter = await generateCoverLetter(resume.contentJson, jd.keywordAnalysis, jd.content);
    await replyInChunks(ctx, `✉️ *Cover Letter*\n\n${coverLetter}`, { parse_mode: "Markdown" });
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next? You can ask me to check skills gaps, do interview prep, or type /menu.");
    return;
  }

  if (nextAction === "interview_prep") {
    await ctx.reply("🎤 Generating interview questions tailored for you...");
    const questions = await generateInterviewPrep(resume.contentJson, jd.content);
    const formatted = formatInterviewPrep(questions);
    await replyInChunks(ctx, formatted, { parse_mode: "Markdown" });
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next? You can ask me to generate a cover letter, check skills gaps, or type /menu.");
    return;
  }

  // Default: ATS Analysis + Tailoring
  await conversationMachine.transition(session.id, "JD_UPLOAD", "ATS_ANALYSIS", { resumeId, jdId: jd.id });

  // Calculate ATS score
  await ctx.reply("🔍 Calculating ATS score...");
  const atsScore = await enhancedATSScore(resume.contentJson, jd.keywordAnalysis);
  const atsFormatted = formatATSScore(atsScore);
  await replyInChunks(ctx, atsFormatted, { parse_mode: "Markdown" });

  // Tailor the resume
  await ctx.reply("✨ Tailoring your resume for this role...");
  const tailorResult = await tailorResume(resume.contentJson, jd.content, jd.keywordAnalysis);

  // Show suggested changes
  if (tailorResult.changes.length > 0) {
    const changesFormatted = formatTailoringChanges(tailorResult.changes);
    await replyInChunks(ctx, `📝 *Suggested Changes:*\n\n${changesFormatted}`, { parse_mode: "Markdown" });

    await ctx.reply(
      `📊 *Score Impact:* ${tailorResult.scoreBefore} → ${tailorResult.scoreAfter} (+${tailorResult.scoreAfter - tailorResult.scoreBefore})`,
      { parse_mode: "Markdown" }
    );

    await conversationMachine.transition(session.id, "ATS_ANALYSIS", "CHANGE_APPROVAL", {
      resumeId,
      jdId: jd.id,
      tailorResult,
    });

    await ctx.reply("Would you like to approve these changes?", changeApprovalOptions());
  } else {
    await ctx.reply("✅ Your resume is already well-optimized for this role! No major changes needed.");
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next? You can tailor for another job description, generate cover letter, or type /menu.");
  }
}

async function handleNewContentInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  await ctx.reply("📝 Incorporating your new content...");

  // Store new content in state data for the finalization step
  await conversationMachine.updateStateData(session.id, {
    newContent: text,
  });

  await ctx.reply("Got it! I'll include this in your tailored resume. Proceeding to finalization...");

  // Transition directly to FINAL_REVIEW instead of simulating a callback
  await conversationMachine.transition(session.id, "NEW_CONTENT", "FINAL_REVIEW", session.stateData);
  await ctx.reply("Your resume has been updated. Would you like to export it? Type /menu to view download and select options.");
}

async function handleConversationalEdit(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  const resumeId = session.stateData?.resumeId;
  if (!resumeId) {
    await ctx.reply("No resume found. Please upload a resume first.", mainMenu());
    return;
  }

  await ctx.reply("🧠 Processing your request and updating your resume...");
  try {
    const resume = await resumeService.getById(resumeId);
    if (!resume) {
      await ctx.reply("Resume not found. Please upload it again.", mainMenu());
      return;
    }

    const { updatedResume, changeSummary } = await editResumeWithAI(resume.contentJson, text);
    
    // Save updated content
    await resumeService.updateWholeContent(resumeId, updatedResume);

    await ctx.reply(`✨ *Updated:* ${changeSummary}`, { parse_mode: "Markdown" });

    // Show fresh assessment
    const assessment = await generateResumeAssessment(updatedResume);
    const summary = formatResumeSummary(updatedResume);
    await replyInChunks(ctx, `${assessment}\n\n---\n${summary}`, { parse_mode: "Markdown" });
    await ctx.reply("Does everything look correct now? You can type another instruction directly to update it, or click below to proceed.", resumeReviewOptions());
  } catch (err: any) {
    logger.error(`Conversational edit failed: ${err.message}`);
    await ctx.reply(`❌ Sorry, I had trouble making that change: ${err.message}\n\nPlease try again with a different request.`);
  }
}

async function handleBuildInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  await ctx.reply("📝 Resume building from scratch is coming in V2. For now, please upload a resume or use a template.");
}

async function handleIdleConversation(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  const textLower = text.toLowerCase().trim();
  
  if (
    ["menu", "help", "features", "what can you do", "what are your features", "how to use", "options", "commands"].some(
      (kw) => textLower.includes(kw)
    )
  ) {
    await ctx.reply(
      `🤖 *Rezumate Agent Capabilities:*\n\n` +
        `• 📄 *Tailor Resumes* — Optimize your resume for a job description.\n` +
        `• 🔍 *Skills Gap Analysis* — Find what skills are missing relative to the job requirements.\n` +
        `• ✉️ *Cover Letters* — Generate custom cover letters tailored to your profile.\n` +
        `• 🎤 *Interview Preparation* — Get customized practice questions and STAR strategies.\n` +
        `• ✏️ *Conversational Editing* — Tell me *"Add Python to my skills"* or *"Rewrite my Google experience"* and I will edit your resume directly!\n\n` +
        `To get a list of clickable buttons at any time, type /menu.`
    );
    return;
  }

  await ctx.sendChatAction("typing");
  const resume = await resumeService.getLatest(userId);
  
  let prompt = `You are Rezumate, a brilliant and supportive AI Career Agent. The user is chatting with you in conversational mode.
User message: "${text}"

`;
  if (resume) {
    prompt += `The user has uploaded their resume.
Candidate Name: ${resume.contentJson.personal.fullName || "User"}
Current Title: ${resume.contentJson.personal.title || "N/A"}
Resume Summary: ${resume.contentJson.summary || "N/A"}

Please address the user's message fully and professionally. 
If they ask for career advice, technical project ideas, cover letter advice, mock interview tips, or resume reviews, provide a complete, detailed, and high-quality response. Use formatting (bullet points, bold text) where helpful to make the output readable.
Do not limit your response size unless appropriate, but keep it structured. Use their resume context (if applicable) to personalize your advice.`;
  } else {
    prompt += `The user has not uploaded a resume yet.
Please address the user's message fully. If they ask general career or project questions, answer them comprehensively. Encourage them to upload their resume (as PDF/DOCX) or paste it, so that you can provide highly personalized advice, tailoring, and interview prep.`;
  }

  try {
    const response = await callLLM(prompt, "You are a warm, collaborative AI career agent.", 2048);
    await replyInChunks(ctx, response.text.trim(), { parse_mode: "Markdown" });
  } catch (err: any) {
    await ctx.reply("I'm here to help you optimize your resume, prepare for interviews, or check skills gap! To see the main menu, type /menu.");
  }
}
