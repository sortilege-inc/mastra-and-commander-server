/** Tiny localStorage wrapper for remembering the user's game/format/mode choice. */

const KEY_GAME = 'tcggg.activeGameId'
const KEY_FORMAT = 'tcggg.activeFormatId'
const KEY_MODE = 'tcggg.activeMode'
const KEY_RECORD = 'tcggg.recordTranscripts'

/** Game mode is a framework-level concept: who's at the keyboard.
 *  Hotseat = two humans share the device; vs-ai = one human plus the
 *  built-in bot. Per `docs/ai-opponent-plan.md` D1 the bot is driven
 *  by a custom React-layer subscriber, not bg.io's bot driver. */
export type GameMode = 'hotseat' | 'vs-ai'

interface GameChoice {
  gameId: string
  formatId: string
  /** Defaults to 'hotseat' when missing for back-compat with saves
   *  from before mode was tracked. */
  mode: GameMode
}

function isGameMode(v: unknown): v is GameMode {
  return v === 'hotseat' || v === 'vs-ai'
}

export function loadGameChoice(): GameChoice | null {
  if (typeof window === 'undefined') return null
  try {
    const gameId = window.localStorage.getItem(KEY_GAME)
    const formatId = window.localStorage.getItem(KEY_FORMAT)
    if (!gameId || !formatId) return null
    const rawMode = window.localStorage.getItem(KEY_MODE)
    const mode: GameMode = isGameMode(rawMode) ? rawMode : 'hotseat'
    return { gameId, formatId, mode }
  } catch {
    return null
  }
}

export function saveGameChoice(choice: GameChoice): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_GAME, choice.gameId)
    window.localStorage.setItem(KEY_FORMAT, choice.formatId)
    window.localStorage.setItem(KEY_MODE, choice.mode)
  } catch {
    /* ignore */
  }
}

export function clearGameChoice(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY_GAME)
    window.localStorage.removeItem(KEY_FORMAT)
    window.localStorage.removeItem(KEY_MODE)
  } catch {
    /* ignore */
  }
}

/** Replay transcript opt-in. Three values:
 *  - 'always': record every game (vs-ai + hotseat)
 *  - 'vs-ai-only': record vs-ai, skip hotseat (default)
 *  - 'never': don't record
 *  Defaults to 'vs-ai-only' when unset — hotseat games may be
 *  friends-vs-friends and shouldn't auto-dump. */
export type RecordTranscriptsChoice = 'always' | 'vs-ai-only' | 'never'

function isRecordChoice(v: unknown): v is RecordTranscriptsChoice {
  return v === 'always' || v === 'vs-ai-only' || v === 'never'
}

export function loadRecordTranscriptsChoice(): RecordTranscriptsChoice {
  if (typeof window === 'undefined') return 'vs-ai-only'
  try {
    const v = window.localStorage.getItem(KEY_RECORD)
    return isRecordChoice(v) ? v : 'vs-ai-only'
  } catch {
    return 'vs-ai-only'
  }
}

export function saveRecordTranscriptsChoice(v: RecordTranscriptsChoice): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY_RECORD, v) } catch { /* ignore */ }
}

/** Should we record this game? Reads the saved choice and the current
 *  mode. */
export function shouldRecordTranscript(mode: GameMode): boolean {
  const choice = loadRecordTranscriptsChoice()
  if (choice === 'always') return true
  if (choice === 'never') return false
  return mode === 'vs-ai'
}
