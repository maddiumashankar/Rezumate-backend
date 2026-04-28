import { conversationRepo } from "../database/repos/conversationRepository";
import { isValidTransition, STATE_PROMPTS } from "./states";
import type { ConversationSession, ConversationState } from "../types";
import logger from "../utils/logger";

export class ConversationMachine {
  /**
   * Get or create a session for a user.
   */
  async getSession(userId: string): Promise<ConversationSession> {
    let session = await conversationRepo.getActiveSession(userId);
    if (!session) {
      session = await conversationRepo.createSession(userId);
    }
    return session;
  }

  /**
   * Transition the session to a new state.
   */
  async transition(
    sessionId: string,
    currentState: ConversationState,
    nextState: ConversationState,
    stateData?: Record<string, any>
  ): Promise<void> {
    if (!isValidTransition(currentState, nextState)) {
      logger.warn(`Invalid transition: ${currentState} → ${nextState}`);
      throw new Error(`Cannot move from ${currentState} to ${nextState}`);
    }

    await conversationRepo.updateState(sessionId, nextState, stateData);
    logger.info(`Session ${sessionId}: ${currentState} → ${nextState}`);
  }

  /**
   * Update state data without changing the state.
   */
  async updateStateData(sessionId: string, data: Record<string, any>): Promise<void> {
    await conversationRepo.mergeStateData(sessionId, data);
  }

  /**
   * Reset session back to IDLE.
   */
  async reset(sessionId: string): Promise<void> {
    await conversationRepo.updateState(sessionId, "IDLE", {});
    logger.info(`Session ${sessionId} reset to IDLE`);
  }

  /**
   * End the session.
   */
  async endSession(sessionId: string): Promise<void> {
    await conversationRepo.deactivateSession(sessionId);
  }

  /**
   * Get the prompt text for a state.
   */
  getPrompt(state: ConversationState): string {
    return STATE_PROMPTS[state];
  }
}

export const conversationMachine = new ConversationMachine();
