import type { Context } from "telegraf";
import { userRepo } from "../../database/repos/userRepository";
import { conversationMachine } from "../../state-machine/machine";
import { markdownToHtml } from "../../utils/formatters";
import logger from "../../utils/logger";

export async function startCommand(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  try {
    // Create or update user
    const user = await userRepo.createOrUpdate(from.id, from.first_name, from.last_name, from.username);

    // Create fresh session
    await conversationMachine.getSession(user.id);

    const name = from.first_name;
    const text = `👋 *Welcome to Rezumate, ${name}!* \n\n` +
      `I am your AI Career Agent. I can help you with:\n\n` +
      `• 📄 *Optimize Resume* — Tailor your resume specifically for a target Job Description (JD).\n` +
      `• 📊 *ATS Score* — Evaluate your resume against a JD to check keyword and format compatibility.\n` +
      `• 🔍 *Skills Gap Analysis* — Check matching and missing skills relative to the job requirements.\n` +
      `• ✏️ *Edit & Modify Resume* — Update/rewrite resume sections or bullets directly.\n` +
      `• 📚 *Career Guidance & Resources* — Get learning links, preparation strategies, and roadmaps (independent of your resume).\n\n` +
      `What would you like me to do? (You can type your request directly, or upload/paste your resume/JD to get started!)`;

    await ctx.reply(markdownToHtml(text), { parse_mode: "HTML" });

    logger.info(`User ${user.id} started bot (telegram: ${from.id})`);
  } catch (err: any) {
    logger.error(`Start command error: ${err.message}`);
    await ctx.reply("❌ Something went wrong. Please try /start again.");
  }
}
