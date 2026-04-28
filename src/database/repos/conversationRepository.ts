import { v4 as uuid } from "uuid";
import { queryOne, execute } from "../db";
import type { ConversationSession, ConversationState } from "../../types";
import logger from "../../utils/logger";

export class ConversationRepository {
  async getActiveSession(userId: string): Promise<ConversationSession | null> {
    const row = await queryOne("SELECT * FROM conversation_sessions WHERE user_id = ? AND is_active = 1 LIMIT 1", [userId]);
    return row ? this.mapRow(row) : null;
  }

  async createSession(userId: string): Promise<ConversationSession> {
    await execute("UPDATE conversation_sessions SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1", [new Date().toISOString(), userId]);
    const id = uuid();
    const now = new Date().toISOString();
    await execute("INSERT INTO conversation_sessions (id, user_id, current_state, state_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, userId, "IDLE", "{}", 1, now, now]);
    return { id, userId, currentState: "IDLE", stateData: {}, isActive: true, createdAt: now, updatedAt: now };
  }

  async updateState(sessionId: string, state: ConversationState, stateData?: Record<string, any>): Promise<void> {
    if (stateData !== undefined) {
      await execute("UPDATE conversation_sessions SET current_state = ?, state_data = ?, updated_at = ? WHERE id = ?", [state, JSON.stringify(stateData), new Date().toISOString(), sessionId]);
    } else {
      await execute("UPDATE conversation_sessions SET current_state = ?, updated_at = ? WHERE id = ?", [state, new Date().toISOString(), sessionId]);
    }
  }

  async mergeStateData(sessionId: string, data: Record<string, any>): Promise<void> {
    const row = await queryOne("SELECT state_data FROM conversation_sessions WHERE id = ?", [sessionId]);
    if (!row) throw new Error(`Session ${sessionId} not found`);
    const merged = { ...JSON.parse(row.state_data), ...data };
    await execute("UPDATE conversation_sessions SET state_data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(merged), new Date().toISOString(), sessionId]);
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await execute("UPDATE conversation_sessions SET is_active = 0, updated_at = ? WHERE id = ?", [new Date().toISOString(), sessionId]);
  }

  private mapRow(row: any): ConversationSession {
    return { id: row.id, userId: row.user_id, currentState: row.current_state as ConversationState, stateData: JSON.parse(row.state_data), isActive: Boolean(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at };
  }
}

export const conversationRepo = new ConversationRepository();
