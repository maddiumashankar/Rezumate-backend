import { v4 as uuid } from "uuid";
import { queryOne, execute } from "../db";
import type { User, UserPreferences } from "../../types";
import { DEFAULT_PREFERENCES } from "../../types";
import logger from "../../utils/logger";

export class UserRepository {
  async findByTelegramId(telegramId: number): Promise<User | null> {
    const row = await queryOne("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await queryOne("SELECT * FROM users WHERE id = ?", [id]);
    return row ? this.mapRow(row) : null;
  }

  async createOrUpdate(telegramId: number, firstName: string, lastName?: string | null, username?: string | null): Promise<User> {
    const existing = await this.findByTelegramId(telegramId);
    const now = new Date().toISOString();

    if (existing) {
      await execute(
        "UPDATE users SET first_name = ?, last_name = ?, username = ?, last_activity_at = ?, updated_at = ? WHERE id = ?",
        [firstName, lastName || null, username || null, now, now, existing.id]
      );
      return { ...existing, firstName, lastName: lastName || null, username: username || null, lastActivityAt: now, updatedAt: now };
    }

    const id = uuid();
    await execute(
      "INSERT INTO users (id, telegram_id, username, first_name, last_name, email, phone, preferences, created_at, updated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, telegramId, username || null, firstName, lastName || null, null, null, JSON.stringify(DEFAULT_PREFERENCES), now, now, now]
    );
    logger.info(`Created new user ${id} for telegram ${telegramId}`);
    return { id, telegramId, username: username || null, firstName, lastName: lastName || null, email: null, phone: null, preferences: DEFAULT_PREFERENCES, createdAt: now, updatedAt: now, lastActivityAt: now };
  }

  private mapRow(row: any): User {
    return {
      id: row.id, telegramId: row.telegram_id, username: row.username, firstName: row.first_name,
      lastName: row.last_name, email: row.email, phone: row.phone,
      preferences: typeof row.preferences === "string" ? JSON.parse(row.preferences) : row.preferences,
      createdAt: row.created_at, updatedAt: row.updated_at, lastActivityAt: row.last_activity_at,
    };
  }
}

export const userRepo = new UserRepository();
