import type { Context } from "telegraf";
import { userRepo } from "../../database/repos/userRepository";
import { conversationMachine } from "../../state-machine/machine";
import { mainMenu } from "../keyboards";

export async function cancelCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userRepo.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply("Please use /start first.");
    return;
  }

  const session = await conversationMachine.getSession(user.id);
  await conversationMachine.reset(session.id);
  await ctx.reply("✅ Operation cancelled. What would you like to do?", mainMenu());
}
