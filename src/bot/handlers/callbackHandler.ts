import type { Context } from "telegraf";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { jdService } from "../../services/jdService";
import { userRepo } from "../../database/repos/userRepository";
import { tailorResume } from "../../agents/resumeTailorAgent";
import { enhancedATSScore } from "../../agents/atsScorer";
import { analyzeSkillsGap, formatSkillsGap } from "../../agents/skillsAnalyzer";
import { generateCoverLetter } from "../../agents/coverLetterAgent";
import { generateResumePDF } from "../../services/pdfService";
import {
  mainMenu,
  resumeUploadOptions,
  editSectionMenu,
  changeApprovalOptions,
  newContentOptions,
  finalReviewOptions,
  templateCategories,
} from "../keyboards";
import { formatATSScore, formatResumeSummary, formatTailoringChanges, formatChangesSummary } from "../../utils/formatters";
import logger from "../../utils/logger";
import path from "path";
import fs from "fs";

/**
 * Handle all inline keyboard callback queries.
 */
export async function handleCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;
  const action = ctx.callbackQuery.data;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  await ctx.answerCbQuery();

  try {
    const user = await userRepo.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Please use /start first.");
      return;
    }

    const session = await conversationMachine.getSession(user.id);

    switch (action) {
      // ---- Main Menu Actions ----
      case "resume_train":
        await conversationMachine.transition(session.id, session.currentState, "RESUME_UPLOAD", {});
        await ctx.editMessageText(
          "📄 *Resume Train Mode*\n\nUpload your resume file or paste the text directly.",
          { parse_mode: "Markdown", ...resumeUploadOptions() }
        );
        break;

      case "my_resume":
        await handleMyResume(ctx, user.id);
        break;

      case "templates":
        await conversationMachine.transition(session.id, session.currentState, "TEMPLATE_SELECT", {});
        await ctx.editMessageText("Choose a resume template category:", templateCategories());
        break;

      case "skills_gap":
        await handleSkillsGap(ctx, user.id, session);
        break;

      case "interview_prep":
        await ctx.editMessageText("🎤 *Interview Prep* is coming in V2! Stay tuned.", { parse_mode: "Markdown" });
        await ctx.reply("What else can I help with?", mainMenu());
        break;

      case "cover_letter":
        await handleCoverLetter(ctx, user.id, session);
        break;

      case "help":
        await ctx.editMessageText(
          `❓ *Rezumate Help*\n\n` +
            `📄 *Resume Train* - Upload resume + JD to get a tailored version\n` +
            `📋 *My Resume* - View/download your latest resume\n` +
            `📎 *Templates* - Start from a template\n` +
            `🔍 *Skills Gap* - Analyze what skills you're missing\n` +
            `✉️ *Cover Letter* - Generate a tailored cover letter\n\n` +
            `Commands: /start, /help, /resume, /cancel`,
          { parse_mode: "Markdown" }
        );
        break;

      // ---- Resume Upload ----
      case "upload_file":
        await ctx.editMessageText("📁 Please send me your resume file (PDF or DOCX).");
        break;

      case "paste_text":
        await ctx.editMessageText("📝 Please paste your resume text below:");
        break;

      // ---- Resume Review ----
      case "review_ok": {
        const resumeId = session.stateData?.resumeId;
        if (!resumeId) {
          await ctx.reply("No resume found in session. Please start over.", mainMenu());
          break;
        }
        await conversationMachine.transition(session.id, session.currentState, "JD_UPLOAD", { resumeId });
        await ctx.editMessageText("✅ Great! Now paste the *Job Description* you want to tailor your resume for:", { parse_mode: "Markdown" });
        break;
      }

      case "edit_section":
        await conversationMachine.transition(session.id, session.currentState, "RESUME_EDIT", session.stateData);
        await ctx.editMessageText("Which section would you like to edit?", editSectionMenu());
        break;

      // ---- Change Approval ----
      case "approve_changes":
        await handleApproveChanges(ctx, user.id, session);
        break;

      case "reject_changes":
        await conversationMachine.reset(session.id);
        await ctx.editMessageText("❌ Changes rejected. Let's try a different approach.");
        await ctx.reply("What would you like to do?", mainMenu());
        break;

      // ---- New Content ----
      case "add_new_content":
        await ctx.editMessageText(
          "Tell me about any new content to add. You can share:\n\n" +
            "• New projects you've worked on\n" +
            "• New skills you've acquired\n" +
            "• Updated job responsibilities\n" +
            "• New certifications\n\n" +
            "Just type it out and I'll incorporate it!"
        );
        break;

      case "skip_new_content":
        await handleFinalizeResume(ctx, user.id, session);
        break;

      // ---- Final Review ----
      case "accept_final":
        await handleAcceptFinal(ctx, user.id, session);
        break;

      case "reject_final":
        await conversationMachine.reset(session.id);
        await ctx.editMessageText("Let's try again with different changes.");
        await ctx.reply("What would you like to do?", mainMenu());
        break;

      // ---- Cancel ----
      case "cancel":
        await conversationMachine.reset(session.id);
        await ctx.editMessageText("Cancelled. Back to main menu.");
        await ctx.reply("What would you like to do?", mainMenu());
        break;

      default:
        logger.warn(`Unknown callback action: ${action}`);
        break;
    }
  } catch (err: any) {
    logger.error(`Callback error (${action}): ${err.message}`);
    await ctx.reply(`❌ Something went wrong: ${err.message}\nPlease try again.`, mainMenu());
  }
}

// ---- Handler functions ----

async function handleMyResume(ctx: Context, userId: string): Promise<void> {
  const resume = await resumeService.getLatest(userId);
  if (!resume) {
    await ctx.editMessageText("You don't have a resume yet. Let's create one!", resumeUploadOptions());
    return;
  }

  const summary = formatResumeSummary(resume.contentJson);
  await ctx.editMessageText(summary, { parse_mode: "Markdown" });

  // Generate and send PDF
  await ctx.reply("Generating your PDF...");
  const pdfDir = path.join(process.cwd(), "data", "pdfs");
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${userId}_latest.pdf`);
  await generateResumePDF(resume.contentJson, pdfPath);

  await ctx.replyWithDocument({
    source: pdfPath,
    filename: `${resume.contentJson.personal.fullName || "resume"}_resume.pdf`,
  });
  await ctx.reply("What else can I help with?", mainMenu());
}

async function handleSkillsGap(ctx: Context, userId: string, session: any): Promise<void> {
  const resume = await resumeService.getLatest(userId);
  if (!resume) {
    await ctx.editMessageText("You need a resume first. Let's create one!", resumeUploadOptions());
    return;
  }

  const jd = session.stateData?.jdId ? await jdService.getById(session.stateData.jdId) : null;
  if (!jd) {
    await conversationMachine.transition(session.id, session.currentState, "JD_UPLOAD", { resumeId: resume.id, nextAction: "skills_gap" });
    await ctx.editMessageText("📋 Paste a Job Description to analyze your skills gap:");
    return;
  }

  await ctx.editMessageText("🔍 Analyzing your skills gap...");
  const result = await analyzeSkillsGap(resume.contentJson, jd.keywordAnalysis);
  const formatted = formatSkillsGap(result);
  await ctx.reply(formatted, { parse_mode: "Markdown" });
  await ctx.reply("What would you like to do next?", mainMenu());
}

async function handleCoverLetter(ctx: Context, userId: string, session: any): Promise<void> {
  const resume = await resumeService.getLatest(userId);
  if (!resume) {
    await ctx.editMessageText("You need a resume first to generate a cover letter.", resumeUploadOptions());
    return;
  }

  const jd = session.stateData?.jdId ? await jdService.getById(session.stateData.jdId) : null;
  if (!jd) {
    await conversationMachine.transition(session.id, session.currentState, "JD_UPLOAD", { resumeId: resume.id, nextAction: "cover_letter" });
    await ctx.editMessageText("📋 Paste the Job Description to generate a cover letter:");
    return;
  }

  await ctx.editMessageText("✉️ Generating your cover letter...");
  const coverLetter = await generateCoverLetter(resume.contentJson, jd.keywordAnalysis, jd.content);
  await ctx.reply(`✉️ *Cover Letter*\n\n${coverLetter}`, { parse_mode: "Markdown" });
  await ctx.reply("What would you like to do next?", mainMenu());
}

async function handleApproveChanges(ctx: Context, userId: string, session: any): Promise<void> {
  const { tailorResult, resumeId, jdId } = session.stateData || {};
  if (!tailorResult || !resumeId) {
    await ctx.reply("No changes found. Please start the tailoring process again.", mainMenu());
    return;
  }

  await conversationMachine.transition(session.id, session.currentState, "NEW_CONTENT", session.stateData);
  await ctx.editMessageText(
    "✅ Changes approved!\n\nWould you like to add any new content before finalizing?",
    newContentOptions()
  );
}

async function handleFinalizeResume(ctx: Context, userId: string, session: any): Promise<void> {
  const { tailorResult, resumeId, jdId } = session.stateData || {};
  if (!tailorResult || !resumeId) {
    await ctx.reply("Something went wrong. Please start over.", mainMenu());
    return;
  }

  // Apply changes
  await resumeService.applyTailoredChanges(
    resumeId,
    tailorResult.tailoredContent,
    tailorResult.changesSummary,
    tailorResult.scoreBefore,
    tailorResult.scoreAfter,
    jdId
  );

  await conversationMachine.transition(session.id, session.currentState, "FINAL_REVIEW", session.stateData);

  // Generate PDF
  const pdfDir = path.join(process.cwd(), "data", "pdfs");
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${userId}_tailored_${Date.now()}.pdf`);
  await generateResumePDF(tailorResult.tailoredContent, pdfPath);

  const name = tailorResult.tailoredContent.personal.fullName || "resume";
  await ctx.reply(
    `📄 *Tailored Resume Ready!*\n\n` +
      `Score: ${tailorResult.scoreBefore} → *${tailorResult.scoreAfter}* (+${tailorResult.scoreAfter - tailorResult.scoreBefore})\n` +
      `Changes: ${tailorResult.changes.length} modifications applied`,
    { parse_mode: "Markdown" }
  );

  await ctx.replyWithDocument({
    source: pdfPath,
    filename: `${name}_tailored_resume.pdf`,
  });

  await ctx.reply("Would you like to accept this version?", finalReviewOptions());
}

async function handleAcceptFinal(ctx: Context, userId: string, session: any): Promise<void> {
  await conversationMachine.reset(session.id);
  await ctx.editMessageText("🎉 *Resume saved successfully!*\n\nYour tailored resume is stored and ready whenever you need it.", { parse_mode: "Markdown" });
  await ctx.reply("What else can I help with?", mainMenu());
}
