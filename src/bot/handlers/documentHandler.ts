import type { Context } from "telegraf";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { conversationMachine } from "../../state-machine/machine";
import { resumeService } from "../../services/resumeService";
import { userRepo } from "../../database/repos/userRepository";
import { resumeReviewOptions } from "../keyboards";
import { formatResumeSummary, replyInChunks } from "../../utils/formatters";
import { generateResumeAssessment } from "../../agents/resumeEditorAgent";
import { isSupportedFileType, isFileSizeValid } from "../../utils/validators";
import logger from "../../utils/logger";

/**
 * Handle document (file) uploads from users.
 */
export async function handleDocument(ctx: Context): Promise<void> {
  if (!ctx.message || !("document" in ctx.message) || !ctx.message.document) return;
  const doc = ctx.message.document;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    // Validate file
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

    // Only accept documents during RESUME_UPLOAD state or IDLE
    if (session.currentState !== "RESUME_UPLOAD" && session.currentState !== "IDLE") {
      await ctx.reply("I wasn't expecting a file right now. Use the menu options to navigate.");
      return;
    }

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
    fs.unlinkSync(tmpPath);

    // Transition to RESUME_REVIEW
    await conversationMachine.transition(session.id, session.currentState, "RESUME_REVIEW", {
      resumeId: resume.id,
    });

    const assessment = await generateResumeAssessment(resume.contentJson);
    const summary = formatResumeSummary(resume.contentJson);
    await replyInChunks(ctx, `${assessment}\n\n---\n${summary}`, { parse_mode: "Markdown" });
    await ctx.reply("Does this sound like you? You can reply directly in chat to ask me to modify any part of it, or click below to proceed.", resumeReviewOptions());
  } catch (err: any) {
    logger.error(`Document handling error: ${err.message}`);
    await ctx.reply(`❌ Error processing your file: ${err.message}\nPlease try again or paste your resume as text.`);
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
        fs.unlinkSync(dest);
        reject(err);
      });
  });
}
