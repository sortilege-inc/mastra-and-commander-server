/**
 * Replay verifier — deterministically replays a recorded transcript
 * and checks that the resulting final G matches the recorded one.
 *
 * Catches engine non-determinism bugs early: any divergence between
 * the live game and a fresh replay (with the same seed + initial
 * state + move sequence) means the engine is reading a wall-clock,
 * a fresh RNG, or some other source of fresh entropy. Surfaces loud
 * in the console so we notice immediately.
 *
 * ── How it works ────────────────────────────────────────────────────
 *
 * 1. Parse the JSONL transcript: header + initialState + moves +
 *    outcome.
 * 2. Build a "replay game" = the original `Game` with `setup` replaced
 *    by `() => initialState.G`. This bypasses applyDeckExport (we
 *    don't have envelopes at replay time) and pins the starting state.
 * 3. Instantiate bg.io's headless Client with `seed = header.rngSeed`.
 * 4. Apply each move via `client.moves[name](...args)`.
 * 5. Compare final `client.getState().G` to recorded `outcome.finalG`.
 *
 * Limitations (documented honestly):
 *   - Mid-replay divergence isn't always visible until the final
 *     compare; we don't snapshot-compare after each move (too expensive
 *     for routine dev-build verification). Future: opt-in step-by-step
 *     mode with snapshot diff per move.
 *   - The replay doesn't simulate the AI driver, auto-ack effects, or
 *     React lifecycle — moves come straight from the transcript log.
 *     Anything those layers contribute non-deterministically would
 *     show up as a final-state divergence (which is what we want).
 *   - Card-impl module side effects via the module-scoped registry
 *     are NOT reset between replay runs. Reaching for a card not
 *     loaded into the live registry would fail; in practice we replay
 *     in the same browser tab where the registry was loaded for the
 *     live game.
 */
import type { Game } from 'boardgame.io'
import type {
  TranscriptHeader, TranscriptMoveEntry, TranscriptOutcomeEntry,
  TranscriptInitialState,
} from './replayTranscript'

export interface ParsedTranscript {
  header: TranscriptHeader
  initialState: TranscriptInitialState | null
  moves: TranscriptMoveEntry[]
  outcome: TranscriptOutcomeEntry | null
}

export type VerifyResult =
  | { ok: true; message: string }
  | {
      ok: false
      stage: 'parse' | 'init' | 'replay' | 'compare'
      message: string
      /** First-divergence info when stage is 'compare'. */
      diff?: { path: string; recorded: unknown; replayed: unknown }
      /** Move that threw when stage is 'replay'. */
      atMove?: { seq: number; name: string; error: string }
    }

// ─────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a JSONL transcript string into structured entries. Tolerant of
 * trailing newlines; rejects any line that doesn't have a `kind` field.
 */
export function parseTranscript(text: string): ParsedTranscript | { error: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let header: TranscriptHeader | null = null
  let initialState: TranscriptInitialState | null = null
  const moves: TranscriptMoveEntry[] = []
  let outcome: TranscriptOutcomeEntry | null = null

  for (let i = 0; i < lines.length; i++) {
    let entry: { kind?: string }
    try {
      entry = JSON.parse(lines[i] ?? '')
    } catch (e) {
      return { error: `line ${i + 1}: invalid JSON (${(e as Error).message})` }
    }
    switch (entry.kind) {
      case 'meta':
        header = entry as TranscriptHeader
        break
      case 'initialState':
        initialState = entry as TranscriptInitialState
        break
      case 'move':
        moves.push(entry as TranscriptMoveEntry)
        break
      case 'outcome':
        outcome = entry as TranscriptOutcomeEntry
        break
      default:
        return { error: `line ${i + 1}: unknown kind "${entry.kind}"` }
    }
  }

  if (!header) return { error: 'missing meta header line' }
  return { header, initialState, moves, outcome }
}

// ─────────────────────────────────────────────────────────────────────────
// Replay
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verify a parsed transcript against the supplied `Game` definition.
 * Returns `{ ok: true }` when the replay's final G matches the
 * recorded final G, or a structured error otherwise.
 *
 * Uses bg.io's headless `Client` for the replay so the move handlers,
 * reducers, plugins, and turn machinery all run exactly as they would
 * in the live game.
 */
export async function verifyTranscript(
  transcript: ParsedTranscript,
  game: Game,
): Promise<VerifyResult> {
  if (!transcript.initialState) {
    return { ok: false, stage: 'init', message: 'transcript has no initial state' }
  }
  if (!transcript.outcome) {
    return { ok: false, stage: 'init', message: 'transcript has no outcome — game was never finalized' }
  }
  if (!transcript.header.rngSeed) {
    return { ok: false, stage: 'init', message: 'transcript header has no rngSeed (probably an older transcript)' }
  }

  // Dynamic import — bg.io's headless client isn't normally loaded by
  // the live game. Vite tree-shakes it out of production builds.
  type HeadlessClient = {
    start: () => void
    moves: Record<string, (...a: unknown[]) => void>
    getState: () => { G: unknown } | null
  }
  let Client: (opts: unknown) => HeadlessClient
  try {
    const mod = await import('boardgame.io/client')
    Client = (mod as { Client: typeof Client }).Client
  } catch (e) {
    return { ok: false, stage: 'init', message: `failed to load boardgame.io/client: ${(e as Error).message}` }
  }

  // Build a replay game: keep the original move handlers but pin the
  // setup to the recorded initial G so we skip applyDeckExport / deck
  // generation.
  const pinnedInitial = transcript.initialState.G
  const replayGame: Game = {
    ...game,
    setup: () => structuredClone(pinnedInitial),
  } as Game

  const client = Client({
    game: replayGame,
    seed: transcript.header.rngSeed,
    numPlayers: 2,
  })
  client.start()

  for (const entry of transcript.moves) {
    const fn = client.moves[entry.name]
    if (typeof fn !== 'function') {
      return {
        ok: false,
        stage: 'replay',
        message: `move "${entry.name}" not found on headless client`,
        atMove: { seq: entry.seq, name: entry.name, error: 'no handler' },
      }
    }
    try {
      fn(...entry.args)
    } catch (e) {
      return {
        ok: false,
        stage: 'replay',
        message: `move "${entry.name}" (seq ${entry.seq}) threw during replay`,
        atMove: { seq: entry.seq, name: entry.name, error: (e as Error).message },
      }
    }
  }

  const replayedG = client.getState()?.G
  if (replayedG === undefined || replayedG === null) {
    return { ok: false, stage: 'compare', message: 'headless client returned no state after replay' }
  }
  const diff = firstDifference('', replayedG, transcript.outcome.finalG)
  if (diff) {
    return {
      ok: false,
      stage: 'compare',
      message: `final G diverged at ${diff.path}`,
      diff,
    }
  }
  return { ok: true, message: `replay matched (${transcript.moves.length} moves)` }
}

// ─────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────

/**
 * Walk two values structurally and return the first differing path,
 * or null if equal. Tuned for the L5R game state shape — plain
 * objects and arrays of primitives, no class instances or circular
 * refs. JSON-shaped data; we don't worry about non-serializable
 * edge cases.
 */
function firstDifference(
  path: string,
  a: unknown,
  b: unknown,
): { path: string; recorded: unknown; replayed: unknown } | null {
  if (a === b) return null
  if (typeof a !== typeof b) return { path, replayed: a, recorded: b }
  if (a === null || b === null) return { path, replayed: a, recorded: b }
  if (typeof a !== 'object') return { path, replayed: a, recorded: b }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return { path, replayed: a, recorded: b }
    if (a.length !== b.length) {
      return { path: `${path}.length`, replayed: a.length, recorded: b.length }
    }
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(`${path}[${i}]`, a[i], b[i])
      if (d) return d
    }
    return null
  }

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
  for (const k of keys) {
    const d = firstDifference(path === '' ? k : `${path}.${k}`, aObj[k], bObj[k])
    if (d) return d
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// Convenience: one-call dev-mode auto-verify
// ─────────────────────────────────────────────────────────────────────────

/**
 * One-shot verify-and-log entry point. Used by Board.tsx in dev builds
 * to validate every completed game; never throws. Logs success at
 * `info`, divergence at `warn`, so console filtering catches issues.
 */
export async function autoVerifyAndLog(text: string, game: Game): Promise<void> {
  const parsed = parseTranscript(text)
  if ('error' in parsed) {
    // eslint-disable-next-line no-console
    console.warn(`[replayVerifier] parse failed: ${parsed.error}`)
    return
  }
  const result = await verifyTranscript(parsed, game)
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.info(`[replayVerifier] ✓ ${result.message}`)
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[replayVerifier] ✗ ${result.stage}: ${result.message}`, result)
  }
}
