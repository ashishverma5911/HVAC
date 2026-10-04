/**
 * Lightweight in-memory abuse limiter for the public anonymous Summit HVAC demo.
 * Zero database writes. Protects upstream Gemini API quota while preserving
 * seamless demo exploration without login or payment requirements.
 */

interface DemoSessionState {
  turns: number;
  tokensRequested: number;
  firstSeen: number;
  lastActive: number;
}

const MAX_DEMO_TURNS = 30; // Maximum customer/assistant turns and tool executions per demo conversation
const MAX_DEMO_TOKENS = 6; // Maximum ephemeral token generations per session
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

class DemoSessionLimiter {
  private sessions = new Map<string, DemoSessionState>();
  private lastCleanup = Date.now();

  private getOrInitSession(conversationId: string): DemoSessionState {
    this.maybeCleanup();
    let state = this.sessions.get(conversationId);
    if (!state) {
      state = {
        turns: 0,
        tokensRequested: 0,
        firstSeen: Date.now(),
        lastActive: Date.now(),
      };
      this.sessions.set(conversationId, state);
    }
    state.lastActive = Date.now();
    return state;
  }

  private maybeCleanup() {
    const now = Date.now();
    // Clean up every 15 minutes
    if (now - this.lastCleanup > 15 * 60 * 1000) {
      this.lastCleanup = now;
      for (const [id, state] of this.sessions.entries()) {
        if (now - state.lastActive > SESSION_TTL_MS) {
          this.sessions.delete(id);
        }
      }
    }
  }

  /**
   * Checks and increments turn / tool action count for a demo conversation.
   */
  public recordTurn(conversationId: string): {
    allowed: boolean;
    turns: number;
    remaining: number;
    reason?: string;
  } {
    const state = this.getOrInitSession(conversationId);
    if (state.turns >= MAX_DEMO_TURNS) {
      return {
        allowed: false,
        turns: state.turns,
        remaining: 0,
        reason: `Demo turn limit (${MAX_DEMO_TURNS}) reached. Please refresh to start a fresh demo session.`,
      };
    }

    state.turns += 1;
    return {
      allowed: true,
      turns: state.turns,
      remaining: MAX_DEMO_TURNS - state.turns,
    };
  }

  /**
   * Checks and records a live audio token request for a demo session.
   */
  public recordTokenRequest(conversationId: string): {
    allowed: boolean;
    tokensRequested: number;
    reason?: string;
  } {
    const state = this.getOrInitSession(conversationId);
    if (state.tokensRequested >= MAX_DEMO_TOKENS) {
      return {
        allowed: false,
        tokensRequested: state.tokensRequested,
        reason: `Demo audio session limit (${MAX_DEMO_TOKENS}) reached for this conversation. Refresh for a new session.`,
      };
    }

    state.tokensRequested += 1;
    return {
      allowed: true,
      tokensRequested: state.tokensRequested,
    };
  }

  /**
   * Resets session (e.g. for testing)
   */
  public reset(conversationId?: string) {
    if (conversationId) {
      this.sessions.delete(conversationId);
    } else {
      this.sessions.clear();
    }
  }

  public getSessionInfo(conversationId: string): DemoSessionState | null {
    return this.sessions.get(conversationId) || null;
  }
}

export const demoLimiter = new DemoSessionLimiter();
