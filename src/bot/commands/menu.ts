import type { Context } from "telegraf";
import { mainMenu } from "../keyboards";

export async function menuCommand(ctx: Context): Promise<void> {
  await ctx.reply("📋 *Rezumate Main Menu*\nChoose an option below to start:", {
    parse_mode: "Markdown",
    ...mainMenu(),
  });
}
