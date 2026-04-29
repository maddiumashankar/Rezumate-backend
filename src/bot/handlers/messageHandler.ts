import type { Context } from "telegraf";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { jdService } from "../../services/jdService";
import { userRepo } from "../../database/repos/userRepository";
import { tailorResume } from "../../agents/resumeTailorAgent";
import { enhancedATSScore } from "../../agents/atsScorer";
import { analyzeSkillsGap, formatSkillsGap } from "../../agents/skillsAnalyzer";
import { generateCoverLetter } from "../../agents/coverLetterAgent";
import { mainMenu, resumeReviewOptions, changeApprovalOptions } from "../keyboards";
import { formatResumeSummary, formatATSScore, formatTailoringChanges } from "../../utils/formatters";
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
        await ctx.reply("Please choose an option from the menu:", mainMenu());
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

      case "RESUME_EDIT":
        await handleEditInput(ctx, user.id, session, text);
        break;

      case "RESUME_BUILD":
        await handleBuildInput(ctx, user.id, session, text);
        break;

      default:
        await ctx.reply("I wasn't expecting text right now. Please use the buttons to navigate.", mainMenu());
        break;
    }
  } catch (err: any) {
    logger.error(`Message handler error: ${err.message}`);
    await ctx.reply(`❌ Error: ${err.message}\nPlease try again.`, mainMenu());
  }
}

// ---- State-specific handlers ----

async function handleResumeTextInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  if (text.length < 50) {
    await ctx.reply("That seems too short for a resume. Please paste the full resume text, or upload a PDF/DOCX file.");
    return;
  }

  await ctx.reply("📝 Parsing your resume text...");
  const resume = await resumeService.createFromText(userId, text);

  await conversationMachine.transition(session.id, "RESUME_UPLOAD", "RESUME_REVIEW", { resumeId: resume.id });

  const summary = formatResumeSummary(resume.contentJson);
  await ctx.reply(summary, { parse_mode: "Markdown" });
  await ctx.reply("Does everything look correct?", resumeReviewOptions());
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
    await ctx.reply(formatted, { parse_mode: "Markdown" });
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next?", mainMenu());
    return;
  }

  if (nextAction === "cover_letter") {
    await ctx.reply("✉️ Generating your cover letter...");
    const coverLetter = await generateCoverLetter(resume.contentJson, jd.keywordAnalysis, jd.content);
    await ctx.reply(`✉️ *Cover Letter*\n\n${coverLetter}`, { parse_mode: "Markdown" });
    await conversationMachine.reset(session.id);
    await ctx.reply("What would you like to do next?", mainMenu());
    return;
  }

  // Default: ATS Analysis + Tailoring
  await conversationMachine.transition(session.id, "JD_UPLOAD", "ATS_ANALYSIS", { resumeId, jdId: jd.id });

  // Calculate ATS score
  await ctx.reply("🔍 Calculating ATS score...");
  const atsScore = await enhancedATSScore(resume.contentJson, jd.keywordAnalysis);
  const atsFormatted = formatATSScore(atsScore);
  await ctx.reply(atsFormatted, { parse_mode: "Markdown" });

  // Tailor the resume
  await ctx.reply("✨ Tailoring your resume for this role...");
  const tailorResult = await tailorResume(resume.contentJson, jd.content, jd.keywordAnalysis);

  // Show suggested changes
  if (tailorResult.changes.length > 0) {
    const changesFormatted = formatTailoringChanges(tailorResult.changes);
    await ctx.reply(`📝 *Suggested Changes:*\n\n${changesFormatted}`, { parse_mode: "Markdown" });

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
    await ctx.reply("What would you like to do next?", mainMenu());
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
  await ctx.reply("Your resume has been updated. Would you like to export it?", mainMenu());
}

async function handleEditInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  await ctx.reply("✏️ Section editing is available in the edit menu. Please use the buttons.", mainMenu());
}

async function handleBuildInput(ctx: Context, userId: string, session: any, text: string): Promise<void> {
  await ctx.reply("📝 Resume building from scratch is coming in V2. For now, please upload a resume or use a template.", mainMenu());
}
