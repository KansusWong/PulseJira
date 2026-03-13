/**
 * PlanModeState — manages plan mode state per conversation.
 *
 * Extended to align with reference implementation (9+ fields).
 */

export interface PlanModeStateData {
  active: boolean;
  planFilePath: string | null;
  taskName: string | null;
  enteredAt: Date | null;
  // --- New fields (reference alignment) ---
  relativePath: string | null;       // Relative path for frontend display
  projectFolder: string | null;      // Current project folder name
  reason: string | null;             // Why plan mode was entered
  pendingQuestion: string | null;    // Pending question for user
  userAnswer: string | null;         // User's answer to pending question
  answerResolver: ((answer: string) => void) | null;  // Promise resolver
}

/** In-memory state store, keyed by conversationId. */
const stateStore = new Map<string, PlanModeStateData>();

const DEFAULT_STATE: PlanModeStateData = {
  active: false,
  planFilePath: null,
  taskName: null,
  enteredAt: null,
  relativePath: null,
  projectFolder: null,
  reason: null,
  pendingQuestion: null,
  userAnswer: null,
  answerResolver: null,
};

export function getPlanModeState(conversationId: string): PlanModeStateData {
  if (!stateStore.has(conversationId)) {
    stateStore.set(conversationId, { ...DEFAULT_STATE });
  }
  return stateStore.get(conversationId)!;
}

export function setPlanModeState(conversationId: string, state: Partial<PlanModeStateData>): void {
  const current = getPlanModeState(conversationId);
  stateStore.set(conversationId, { ...current, ...state });
}

export function clearPlanModeState(conversationId: string): void {
  stateStore.delete(conversationId);
}

// ---------------------------------------------------------------------------
// Question / Answer flow
// ---------------------------------------------------------------------------

/**
 * Set a pending question and return a promise that resolves when answered.
 */
export function setPendingQuestion(conversationId: string, question: string): void {
  const state = getPlanModeState(conversationId);
  state.pendingQuestion = question;
  state.userAnswer = null;
  state.answerResolver = null;
  stateStore.set(conversationId, state);
}

/**
 * Resolve a pending question with the user's answer.
 */
export function answerQuestion(conversationId: string, answer: string): void {
  const state = getPlanModeState(conversationId);
  state.userAnswer = answer;
  state.pendingQuestion = null;
  if (state.answerResolver) {
    state.answerResolver(answer);
    state.answerResolver = null;
  }
  stateStore.set(conversationId, state);
}

/**
 * Wait for a user answer to a pending question.
 * Returns null on timeout.
 */
export function waitForAnswer(conversationId: string, timeoutMs = 600000): Promise<string | null> {
  return new Promise((resolve) => {
    const state = getPlanModeState(conversationId);

    // Already answered
    if (state.userAnswer !== null) {
      const answer = state.userAnswer;
      state.userAnswer = null;
      resolve(answer);
      return;
    }

    // Set resolver
    state.answerResolver = (answer: string) => {
      clearTimeout(timer);
      resolve(answer);
    };

    // Timeout
    const timer = setTimeout(() => {
      const s = getPlanModeState(conversationId);
      s.answerResolver = null;
      s.pendingQuestion = null;
      resolve(null);
    }, timeoutMs);
  });
}
