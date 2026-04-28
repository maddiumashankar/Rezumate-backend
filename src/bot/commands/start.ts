import type { Context } from "telegraf";
import { userRepo } from "../../database/repos/userRepository";
import { conversationMachine } from "../../state-machine/machine";
import { mainMenu } from "../keyboards";
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
    await ctx.reply(
      `👋 Welcome to *Rezumate*, ${name}!\n\n` +
        `I'm your AI-powered resume assistant. I can help you:\n\n` +
        `📄 *Resume Train* — Tailor your resume for any job\n` +
        `📋 *My Resume* — View & download your latest resume\n` +
        `📎 *Templates* — Start from a professional template\n` +
        `🔍 *Skills Gap* — Find what skills you're missing\n` +
        `✉️ *Cover Letter* — Generate a tailored cover letter\n` +
        `🎤 *Interview Prep* — Practice for your interview\n\n` +
        `Let's get started! What would you like to do?`,
      { parse_mode: "Markdown", ...mainMenu() }
    );

    logger.info(`User ${user.id} started bot (telegram: ${from.id})`);
  } catch (err: any) {
    logger.error(`Start command error: ${err.message}`);
    await ctx.reply("❌ Something went wrong. Please try /start again.");
  }
}
