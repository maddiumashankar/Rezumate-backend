import { Telegraf } from "telegraf";
import { startCommand } from "./commands/start";
import { helpCommand } from "./commands/help";
import { resumeCommand } from "./commands/resume";
import { cancelCommand } from "./commands/cancel";
import { menuCommand } from "./commands/menu";
import { handleMessage } from "./handlers/messageHandler";
import { handleCallback } from "./handlers/callbackHandler";
import { handleDocument } from "./handlers/documentHandler";
import logger from "../utils/logger";

export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required in .env");
  }

  const bot = new Telegraf(token);

  // ---- Middleware ----
  bot.use(async (ctx, next) => {
    const start = Date.now();
    const userId = ctx.from?.id || "unknown";
    logger.debug(`[${userId}] ${ctx.updateType}`);

    try {
      await next();
    } catch (err: any) {
      logger.error(`Unhandled error for user ${userId}: ${err.message}\n${err.stack}`);
      try {
        await ctx.reply("❌ An unexpected error occurred. Please try again or use /cancel to reset.");
      } catch {}
    }

    const ms = Date.now() - start;
    logger.debug(`[${userId}] Response time: ${ms}ms`);
  });

  // ---- Commands ----
  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command("menu", menuCommand);
  bot.command("resume", resumeCommand);
  bot.command("cancel", cancelCommand);

  // ---- Handlers ----
  bot.on("callback_query", handleCallback);
  bot.on("document", handleDocument);
  bot.on("text", handleMessage);

  // ---- Error handling ----
  bot.catch((err: any, ctx) => {
    logger.error(`Bot error: ${err.message}`);
  });

  return bot;
}
