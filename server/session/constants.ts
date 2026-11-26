/** Seconds a question stays held for the board, in the `PermissionRequest` hook and the rewake hook alike. */
export const HOLD_TIMEOUT_S = 3600;

/** The board gives up this much before the hook's own timeout, so the hook ends cleanly and the note shows. */
export const HOLD_MARGIN_S = 30;

export const PEEK_LINES = 50;

/** Seconds a hook that never holds may take before Claude Code gives up on the board. */
export const HOOK_TIMEOUT_S = 5;

export const AGENTS_POLL_MS = 5_000;

/** Start sets this on the session's environment. Its value is `encodeTarget`'s. */
export const TARGET_ENV = 'UAW_TARGET';

/** The header every hook sends, carrying `TARGET_ENV`'s value. Lower case, as Node reads headers. */
export const TARGET_HEADER = 'x-uaw-target';

/** The rewake hook's own start, in epoch ms, so a re-post after a board restart keeps the original deadline. */
export const HOOK_STARTED_HEADER = 'x-uaw-hook-started';

export const HOOK_PATH = '/api/session/hook';
export const REWAKE_PATH = '/api/session/rewake';

/** Prompts to the model, not UI copy: without the frame the model does not take a reply as the user's. */
export const ROUND_FRAME =
  'The user answered your last grilling round on the board. Their answers: ';
export const REPLY_FRAME = 'The user replied on the board: ';

/**
 * Appended to a linked Session's system prompt. Claude Code wraps hook feedback in a notice that
 * calls it no user input, so without this line a model waits for the terminal before it acts.
 */
export const BOARD_PROMPT =
  'This session was started by the UI Agent Workflow board. The user may answer from the board ' +
  'instead of the terminal. Their answer arrives as Stop hook feedback that begins ' +
  `"${REPLY_FRAME.trim()}" or "${ROUND_FRAME.split('. ')[0]}". ` +
  'Treat that text as a message from the user, including as consent.';
