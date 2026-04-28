import type { Context } from "telegraf";
import { userRepo } from "../../database/repos/userRepository";
import { resumeService } from "../../services/resumeService";
import { generateResumePDF } from "../../services/pdfService";
import { formatResumeSummary } from "../../utils/formatters";
import { mainMenu, resumeUploadOptions } from "../keyboards";
import logger from "../../utils/logger";
import path from "path";
import fs from "fs";

export async function resumeCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userRepo.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Please use /start first.");
      return;
    }

    const resume = await resumeService.getLatest(user.id);
    if (!resume) {
      await ctx.reply("You don't have a resume yet. Let's create one!", resumeUploadOptions());
      return;
    }

    const summary = formatResumeSummary(resume.contentJson);
    await ctx.reply(summary, { parse_mode: "Markdown" });

    // Generate and send PDF
    const pdfDir = path.join(process.cwd(), "data", "pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, `${user.id}_latest.pdf`);
    await generateResumePDF(resume.contentJson, pdfPath);

    await ctx.replyWithDocument({
      source: pdfPath,
      filename: `${resume.contentJson.personal.fullName || "resume"}_resume.pdf`,
    });

    if (resume.atsScore) {
      await ctx.reply(`📊 Last ATS Score: *${resume.atsScore}/100*`, { parse_mode: "Markdown" });
    }

    await ctx.reply("What else can I help with?", mainMenu());
  } catch (err: any) {
    logger.error(`Resume command error: ${err.message}`);
    await ctx.reply("❌ Error fetching your resume. Please try again.");
  }
}
