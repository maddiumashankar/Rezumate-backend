import type { Context, MiddlewareFn } from "telegraf";
import logger from "../../utils/logger";

// Track active processing operations by Telegram user ID
const processingUsers = new Set<number>();

/**
 * Middleware that prevents duplicate concurrent executions per user
 * and provides continuous visual typing feedback while processing.
 */
export const lockMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return next();
  }

  // Check if message is a command that should bypass lock (e.g. /cancel, /reset, /start)
  if (ctx.message && "text" in ctx.message) {
    const text = ctx.message.text.trim();
    if (text.startsWith("/cancel") || text.startsWith("/reset") || text.startsWith("/exit") || text.startsWith("/start")) {
      return next();
    }
  }

  if (processingUsers.has(userId)) {
    logger.info(`Blocked concurrent request for user ${userId} while previous task is active.`);
    await ctx.reply("⏳ I am still processing your previous request. Please wait a moment...");
    return;
  }

  processingUsers.add(userId);

  // Trigger initial visual feedback
  try {
    if (ctx.message && "document" in ctx.message) {
      await ctx.sendChatAction("upload_document").catch(() => {});
    } else {
      await ctx.sendChatAction("typing").catch(() => {});
    }
  } catch (err: any) {
    logger.debug(`Failed to send chat action: ${err.message}`);
  }

  // Continuously refresh typing action every 4 seconds for long running agent operations
  const typingInterval = setInterval(async () => {
    try {
      await ctx.sendChatAction("typing").catch(() => {});
    } catch {}
  }, 4000);

  try {
    await next();
  } finally {
    clearInterval(typingInterval);
    processingUsers.delete(userId);
  }
};
