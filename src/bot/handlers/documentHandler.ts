import type { Context } from "telegraf";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { userRepo } from "../../database/repos/userRepository";
import { formatResumeSummary, replyInChunks, markdownToHtml } from "../../utils/formatters";
import { generateResumeAssessment } from "../../agents/resumeEditorAgent";
import { isSupportedFileType, isFileSizeValid } from "../../utils/validators";
import { handleMessage, executePendingAction } from "./messageHandler";
import logger from "../../utils/logger";

/**
 * Handle document (file) uploads from users.
 * Conversational behavior: accepts uploads anytime, parses it, updates session resumeId,
 * and checks if there's a pending user command.
 */
export async function handleDocument(ctx: Context): Promise<void> {
  if (!ctx.message || !("document" in ctx.message) || !ctx.message.document) return;
  const doc = ctx.message.document;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    // Validate file type
    const mimeType = doc.mime_type || "";
    if (!isSupportedFileType(mimeType)) {
      await ctx.reply("❌ Unsupported file type. Please upload a PDF or DOCX file.");
      return;
    }

    if (doc.file_size && !isFileSizeValid(doc.file_size)) {
      await ctx.reply("❌ File too large. Maximum size is 10MB.");
      return;
    }

    // Get user and session
    const user = await userRepo.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Please use /start first to set up your account.");
      return;
    }

    const session = await conversationMachine.getSession(user.id);

    await ctx.reply("📥 Downloading and parsing your resume...");

    // Download the file
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const ext = path.extname(doc.file_name || "file.pdf") || ".pdf";
    const tmpDir = path.join(process.cwd(), "data", "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${telegramId}_${Date.now()}${ext}`);

    await downloadFile(fileLink.href, tmpPath);

    // Parse and create resume
    const resume = await resumeService.createFromFile(user.id, tmpPath, doc.file_name || "resume");

    // Clean up temp file
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    // Update active resume ID in session data
    const nextStateData = { ...session.stateData, resumeId: resume.id };
    await conversationMachine.updateStateData(session.id, nextStateData);

    const assessment = await generateResumeAssessment(resume.contentJson);
    const summary = formatResumeSummary(resume.contentJson);
    
    const welcomeMsg = `✅ *Resume uploaded and parsed successfully!*\n\n${assessment}\n\n---\n${summary}`;
    await replyInChunks(ctx, markdownToHtml(welcomeMsg), { parse_mode: "HTML" });

    // Check if there was a pending action waiting for a resume
    const pendingAction = session.stateData?.pendingAction;
    if (pendingAction) {
      const resumptionMsg = getResumptionMessage(pendingAction);
      await ctx.reply(markdownToHtml(resumptionMsg), { parse_mode: "HTML" });
      
      // Clear pending action and reset state machine to IDLE with updated state data
      await conversationMachine.reset(session.id);
      await conversationMachine.updateStateData(session.id, { ...nextStateData, pendingAction: null });
      
      await executePendingAction(ctx, user.id, session.id, pendingAction, nextStateData);
    } else {
      await conversationMachine.reset(session.id);
      await conversationMachine.updateStateData(session.id, nextStateData);
      await ctx.reply("What would you like me to do with your resume? (e.g. check ATS score against a JD, optimize it, analyze skills gaps, or make conversational edits). Feel free to type your request directly!");
    }
  } catch (err: any) {
    logger.error(`Document handling error: ${err.message}`);
    await ctx.reply(`❌ Error processing your file: ${err.message}\nPlease try again.`);
  }
}

function getResumptionMessage(action: string): string {
  switch (action) {
    case "ATS_SCORE":
      return "🔄 *Resuming your request:* Checking ATS score...";
    case "OPTIMIZE_RESUME":
      return "🔄 *Resuming your request:* Optimizing your resume...";
    case "SKILLS_GAP":
      return "🔄 *Resuming your request:* Analyzing skills gap...";
    case "EDIT_RESUME":
      return "🔄 *Resuming your request:* Processing edits on your resume...";
    case "EXPORT_PDF":
      return "🔄 *Resuming your request:* Exporting PDF resume...";
    default:
      return "🔄 *Resuming your request:* Continuing with your resume...";
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        reject(err);
      });
  });
}
