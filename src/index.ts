import dotenv from "dotenv";
dotenv.config();

import { createBot } from "./bot";
import { initializeDatabase, shutdownDb } from "./database/db";
import { startApiServer } from "./api/server";
import logger from "./utils/logger";

async function main(): Promise<void> {
  logger.info("🚀 Starting Rezumate v2...");

  // Validate environment
  const requiredEnv = ["GROQ_API_KEY"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      logger.error(`Missing required env variable: ${key}`);
      process.exit(1);
    }
  }

  // Initialize database
  logger.info("📦 Initializing database...");
  await initializeDatabase();

  // Start REST API server (always)
  logger.info("🌐 Starting REST API...");
  startApiServer();

  // Start Telegram bot (optional — only if token is configured)
  if (process.env.TELEGRAM_BOT_TOKEN) {
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
    logger.info("✅ Rezumate is running! Bot + API active. Press Ctrl+C to stop.");
  } else {
    logger.info("ℹ️  No TELEGRAM_BOT_TOKEN — running API-only mode");
    logger.info("✅ Rezumate API is running! Press Ctrl+C to stop.");

    // Graceful shutdown (API-only)
    const shutdown = (signal: string) => {
      logger.info(`${signal} received. Shutting down...`);
      shutdownDb();
      process.exit(0);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}\n${err.stack}`);
  shutdownDb();
  process.exit(1);
});
