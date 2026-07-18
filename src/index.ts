import dotenv from "dotenv";
dotenv.config();

import { createBot } from "./bot";
import { initializeDatabase, shutdownDb } from "./database/db";
import logger from "./utils/logger";

async function main(): Promise<void> {
  logger.info("🚀 Starting Rezumate v2 (Telegram Bot)...");

  // Validate environment
  const requiredEnv = ["GROQ_API_KEY", "TELEGRAM_BOT_TOKEN"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      logger.error(`Missing required env variable: ${key}`);
      process.exit(1);
    }
  }

  // Initialize database
  logger.info("📦 Initializing database...");
  await initializeDatabase();

  // Start Telegram bot
  const bot = createBot();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down...`);
    bot.stop(signal);
    shutdownDb();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("🤖 Launching Telegram bot...");
  await bot.launch();
  logger.info("✅ Rezumate is running! Bot active. Press Ctrl+C to stop.");
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}\n${err.stack}`);
  shutdownDb();
  process.exit(1);
});
