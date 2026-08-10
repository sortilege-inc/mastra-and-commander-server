/**
 * Replay transcript recorder — append-only JSONL log of completed
 * games, for ML training data + post-hoc analysis.
 *
 * Different shape from `savedGame.ts`:
 *   - SavedGame: state snapshot at a point in time (for resume).
 *   - Transcript: every move from setup to winner, plus outcome
 *     metadata (for replay, value learning, behavioral cloning).
 *
 * Per `docs/ai-opponent-plan.md` "Replay transcripts" section: capture
 * NOW even though we can't train yet — you can't go back and capture
 * games you didn't record.
 *
 * ── Module-scoped recording state ──────────────────────────────────
 *
 * One active transcript per browser tab. `beginTranscript` opens the
 * recorder (called by App.tsx when applyDeckExport finishes);
 * `recordMove` appends per dispatch (Board's moves-Proxy wrapper);
 * `endTranscript` produces the JSONL blob and `downloadTranscript`
 * triggers the browser download (called by Board when `G.winner`
 * goes non-null).
 *
 * ── LocalStorage backup ────────────────────────────────────────────
 *
 * Each `recordMove` also mirrors to `localStorage.tcggg.activeTranscript`.
 * A mid-game crash leaves the data there; on next session start the
 * user could recover via a future "rescue dropped transcript" affordance.
 * Today we just clear the slot when endTranscript fires.
 */
import type { DeckExport } from './types'
import type { GameMode } from './storage'

// ─────────────────────────────────────────────────────────────────────────
// Wire types — append-only JSONL entries
// ─────────────────────────────────────────────────────────────────────────

export interface TranscriptDeckInfo {
  playerNum: 1 | 2
  name: string
  splashClan: string | null
  cardCount: number
  formatId: string
}

export interface TranscriptHeader {
  kind: 'meta'
  exportVersion: 1
  gameId: string
  format: string
  mode: GameMode
  /** AI policy + app version that played any bot-tagged moves, e.g.
   *  `"sensei+lookahead(W=15,K=5)@0.3.3"`. Set by App.tsx from the game's
   *  `botPolicyId` + the Vite-injected package version (training-data
   *  provenance). `"unknown"` if a caller omits it. */
  senseiVersion: string
  startedAt: string
  decks: TranscriptDeckInfo[]
  /** bg.io's RNG seed, when accessible. Batch 1: always null (filled
   *  in batch 2 once the engine exposes it). */
  rngSeed: string | null
  /** Human-readable note from the runner. Optional. */
  note?: string
}

export interface TranscriptInitialState {
  kind: 'initialState'
  /** Full G after setup() and applyDeckExport ran, before any move.
   *  Snapshot via structuredClone. */
  G: unknown
}

export type MoveSource = 'human' | 'bot' | 'auto'

export interface TranscriptMoveEntry {
  kind: 'move'
  /** Monotonic counter starting at 1. */
  seq: number
  /** Wall-clock timestamp of the dispatch in ms since epoch. */
  t: number
  /** Who dispatched. `'human'` = real user input;
   *  `'bot'` = AI driver in Vs AI mode; `'auto'` = auto-ack effect
   *  (PassDevice / TurnHandoff) the Board fires for the human in
   *  Vs AI mode. */
  by: MoveSource
  /** `G.activePlayer` at the moment of dispatch — derived from the
   *  recording call site. */
  activePlayer: string
  /** Move name as registered in Game.ts (e.g. 'playCharacterFromHand'). */
  name: string
  /** Concrete args. */
  args: unknown[]
  /** Bot-specific metadata (score, candidate count, top runner-up).
   *  Null on human/auto moves. Filled from the diagnostics ring buffer
   *  at recording time. */
  botMeta: TranscriptBotMeta | null
}

export interface TranscriptBotMeta {
  score: number
  candidateCount: number
  category: string
  label?: string
  topRunnerUp: { move: string; label?: string; score: number } | null
  isSafetyPass: boolean
}

export interface TranscriptOutcomeEntry {
  kind: 'outcome'
  endedAt: string
  winner: string | null
  /** Why the game ended. The Board's GameOverOverlay computes this
   *  from G; we mirror the string. */
  reason: string
  /** Final G snapshot — full state, useful for value-learning labels. */
  finalG: unknown
}

export type TranscriptEntry =
  | TranscriptHeader
  | TranscriptInitialState
  | TranscriptMoveEntry
  | TranscriptOutcomeEntry

// ─────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tcggg.activeTranscript'

interface ActiveTranscript {
  header: TranscriptHeader
  /** Set once on first recordInitialState. */
  initialState: TranscriptInitialState | null
  moves: TranscriptMoveEntry[]
  outcome: TranscriptOutcomeEntry | null
  /** Monotonic move counter. */
  seq: number
}

let ACTIVE: ActiveTranscript | null = null

function persistBackup(): void {
  if (typeof window === 'undefined') return
  if (!ACTIVE) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ACTIVE))
  } catch {
    // Quota / SecurityError — best-effort, don't block recording.
  }
}

function clearBackup(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Open a new transcript. Replaces any active one (rare — typically the
 * App.tsx caller has already called endTranscript on the previous
 * game).
 */
export function beginTranscript(args: {
  gameId: string
  format: string
  mode: GameMode
  envelopes: DeckExport[]
  /** bg.io RNG seed for this game. Captured in the transcript header
   *  so the replay verifier can deterministically reconstruct the
   *  game from the move list. */
  rngSeed?: string | null
  senseiVersion?: string
  note?: string
}): void {
  const decks: TranscriptDeckInfo[] = args.envelopes.map((env, idx) => ({
    playerNum: (idx + 1) as 1 | 2,
    name: env.deck.name,
    splashClan: env.deck.splashClan ?? null,
    cardCount: Object.keys(env.cards).length,
    formatId: env.deck.formatId,
  }))
  const header: TranscriptHeader = {
    kind: 'meta',
    exportVersion: 1,
    gameId: args.gameId,
    format: args.format,
    mode: args.mode,
    senseiVersion: args.senseiVersion ?? 'unknown',
    startedAt: new Date().toISOString(),
    decks,
    rngSeed: args.rngSeed ?? null,
    note: args.note,
  }
  ACTIVE = { header, initialState: null, moves: [], outcome: null, seq: 0 }
  persistBackup()
}

/**
 * Snapshot the initial G — called once by Board on first render after
 * the GameClient mounts. Subsequent calls are no-ops so a stale React
 * effect re-fire doesn't overwrite the recorded initial state.
 */
export function recordInitialState(G: unknown): void {
  if (!ACTIVE) return
  if (ACTIVE.initialState) return
  ACTIVE.initialState = {
    kind: 'initialState',
    G: safeClone(G),
  }
  persistBackup()
}

/**
 * Append a move entry. Called from the moves-Proxy wrapper (see
 * `wrapMovesForRecording`).
 */
export function recordMove(args: {
  name: string
  args: unknown[]
  by: MoveSource
  activePlayer: string
  botMeta: TranscriptBotMeta | null
}): void {
  if (!ACTIVE) return
  const entry: TranscriptMoveEntry = {
    kind: 'move',
    seq: ++ACTIVE.seq,
    t: nowMs(),
    by: args.by,
    activePlayer: args.activePlayer,
    name: args.name,
    args: safeClone(args.args) as unknown[],
    botMeta: args.botMeta,
  }
  ACTIVE.moves.push(entry)
  persistBackup()
}

/**
 * Close the active transcript and download the JSONL blob. Returns
 * the serialized JSONL text so callers can pipe it to the replay
 * verifier (which expects the same string a file-load would give it).
 * Returns null when there was no active transcript or it was already
 * ended.
 */
export function endTranscriptAndDownload(args: {
  G: unknown
  winner: string | null
  reason: string
}): string | null {
  if (!ACTIVE) return null
  if (ACTIVE.outcome) return null    // already ended
  ACTIVE.outcome = {
    kind: 'outcome',
    endedAt: new Date().toISOString(),
    winner: args.winner,
    reason: args.reason,
    finalG: safeClone(args.G),
  }
  const text = serializeActive()
  const blob = new Blob([text], { type: 'application/x-jsonlines' })
  const url = URL.createObjectURL(blob)
  const stamp = ACTIVE.outcome.endedAt.replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19)
  const filename = `${ACTIVE.header.gameId}_${stamp}_${ACTIVE.header.mode}.jsonl`
  if (typeof document !== 'undefined') {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  clearBackup()
  ACTIVE = null
  return text
}

/**
 * Throw the active transcript away without saving — used when the
 * user switches games or aborts. Mid-game crashes use the localStorage
 * backup instead.
 */
export function discardTranscript(): void {
  ACTIVE = null
  clearBackup()
}

/**
 * Manual mid-game export. Snapshots the current state as an
 * "incomplete" outcome entry and downloads the JSONL — but does NOT
 * end the active transcript. The user can keep playing and either
 * trigger another snapshot later or get the normal end-of-game
 * download.
 *
 * Useful for capturing in-progress games (test sessions, hung states,
 * etc.) where waiting for a natural winner isn't an option. Returns
 * the serialized text (null when no active transcript).
 */
export function exportInFlightTranscript(args: {
  G: unknown
  reason?: string
}): string | null {
  if (!ACTIVE) return null
  const snapshotOutcome: TranscriptOutcomeEntry = {
    kind: 'outcome',
    endedAt: new Date().toISOString(),
    winner: null,
    reason: args.reason ?? 'manual snapshot — game in progress',
    finalG: safeClone(args.G),
  }
  // Serialize the current ACTIVE state + a synthetic incomplete
  // outcome line. We DON'T mutate ACTIVE — the recorder keeps
  // running so the next snapshot / final download includes all
  // moves through the current dispatch.
  const lines: string[] = []
  lines.push(JSON.stringify(ACTIVE.header))
  if (ACTIVE.initialState) lines.push(JSON.stringify(ACTIVE.initialState))
  for (const m of ACTIVE.moves) lines.push(JSON.stringify(m))
  lines.push(JSON.stringify(snapshotOutcome))
  const text = lines.join('\n') + '\n'

  const blob = new Blob([text], { type: 'application/x-jsonlines' })
  const url = URL.createObjectURL(blob)
  const stamp = snapshotOutcome.endedAt.replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19)
  const filename = `${ACTIVE.header.gameId}_${stamp}_${ACTIVE.header.mode}_snapshot.jsonl`
  if (typeof document !== 'undefined') {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return text
}

/** True iff there's a transcript currently being recorded. Used by
 *  the StatusBar to gate the "Save transcript" button. */
export function isRecording(): boolean {
  return ACTIVE !== null
}

/** Snapshot — for the diagnostic panel / tests. */
export function getActiveTranscript(): ActiveTranscript | null {
  return ACTIVE
}

/** Test helper. */
export function _clearTranscriptForTests(): void {
  ACTIVE = null
  clearBackup()
}

// ─────────────────────────────────────────────────────────────────────────
// Moves-Proxy wrapper
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wrap a bg.io `moves` object so every dispatch is recorded with the
 * `defaultSource` tag. Returns a Proxy that passes through to the
 * original `moves` after capturing the call.
 *
 * The Board creates TWO wraps: one for human dispatches (default
 * source `'human'`) used by Board's onClick handlers; one for the
 * AI driver (default source `'bot'`) used inside `useAIDriver`. The
 * Board's auto-ack effects use a third wrap with source `'auto'`.
 *
 * `activePlayerLens` reads the current `G.activePlayer` at dispatch
 * time so the recorder doesn't need a separate hook.
 */
export function wrapMovesForRecording<M extends Record<string, unknown>>(
  moves: M,
  defaultSource: MoveSource,
  activePlayerLens: () => string,
  botMetaLens?: () => TranscriptBotMeta | null,
): M {
  return new Proxy(moves, {
    get(target, prop) {
      const orig = (target as Record<string, unknown>)[String(prop)]
      if (typeof orig !== 'function') return orig
      return (...callArgs: unknown[]) => {
        try {
          recordMove({
            name: String(prop),
            args: callArgs,
            by: defaultSource,
            activePlayer: activePlayerLens(),
            botMeta: defaultSource === 'bot' && botMetaLens
              ? botMetaLens()
              : null,
          })
        } catch (e) {
          // Recording errors must NEVER block dispatch.
          // eslint-disable-next-line no-console
          console.warn('[replayTranscript] recordMove threw:', e)
        }
        return (orig as (...a: unknown[]) => unknown)(...callArgs)
      }
    },
  }) as M
}

// ─────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────

function serializeActive(): string {
  if (!ACTIVE) return ''
  const lines: string[] = []
  lines.push(JSON.stringify(ACTIVE.header))
  if (ACTIVE.initialState) lines.push(JSON.stringify(ACTIVE.initialState))
  for (const m of ACTIVE.moves) lines.push(JSON.stringify(m))
  if (ACTIVE.outcome) lines.push(JSON.stringify(ACTIVE.outcome))
  return lines.join('\n') + '\n'
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Safe deep-clone. structuredClone fails for non-serializable values
 *  (functions, class instances); fall back to JSON round-trip which
 *  silently drops those — fine for our purposes. */
function safeClone<T>(v: T): T {
  if (v === null || v === undefined) return v
  try {
    return structuredClone(v)
  } catch {
    try {
      return JSON.parse(JSON.stringify(v)) as T
    } catch {
      return v
    }
  }
}

/** Date.now() wrapper — kept in one place so tests can mock. */
function nowMs(): number {
  return Date.now()
}
