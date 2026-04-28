import type { Context } from "telegraf";
import { mainMenu } from "../keyboards";

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    `❓ *Rezumate Help*\n\n` +
      `*Commands:*\n` +
      `/start — Start the bot & show main menu\n` +
      `/help — Show this help message\n` +
      `/resume — Quick access to your resume\n` +
      `/cancel — Cancel current operation\n\n` +
      `*How to use:*\n` +
      `1️⃣ Upload your resume (PDF/DOCX) or paste text\n` +
      `2️⃣ Paste a job description\n` +
      `3️⃣ I'll analyze, score, and tailor your resume\n` +
      `4️⃣ Review changes, add content, and download\n\n` +
      `*Tips:*\n` +
      `• Use PDF or DOCX format for best results\n` +
      `• Include the full JD text for accurate matching\n` +
      `• Review the ATS score breakdown for insights\n` +
      `• Try different JDs to create multiple versions`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
}
