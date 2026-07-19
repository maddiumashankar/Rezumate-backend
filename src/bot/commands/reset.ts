import type { Context } from "telegraf";
import { userRepo } from "../../database/repos/userRepository";
import { transaction } from "../../database/db";
import { markdownToHtml } from "../../utils/formatters";
import logger from "../../utils/logger";

export async function resetCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userRepo.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("❌ No active profile found. You can start fresh by typing /start.");
      return;
    }

    logger.info(`Purging all data for user ${user.id} (telegram: ${telegramId})`);

    // Delete in sequence to satisfy foreign key constraints
    await transaction([
      { sql: "DELETE FROM job_applications WHERE user_id = ?", params: [user.id] },
      { sql: "DELETE FROM resume_versions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)", params: [user.id] },
      { sql: "DELETE FROM resumes WHERE user_id = ?", params: [user.id] },
      { sql: "DELETE FROM job_descriptions WHERE user_id = ?", params: [user.id] },
      { sql: "DELETE FROM conversation_sessions WHERE user_id = ?", params: [user.id] },
      { sql: "DELETE FROM users WHERE id = ?", params: [user.id] },
    ]);

    const text = "🗑️ *Profile Reset Completed!*\n\n" +
      "All your resumes, job descriptions, conversation history, and preferences have been permanently deleted.\n\n" +
      "Type /start when you are ready to begin fresh.";

    await ctx.reply(markdownToHtml(text), { parse_mode: "HTML" });
  } catch (err: any) {
    logger.error(`Reset command error: ${err.message}`);
    await ctx.reply("❌ An error occurred while resetting your profile. Please try again.");
  }
}
