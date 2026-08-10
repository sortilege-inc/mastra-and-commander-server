/**
 * AI driver — generic React hook that pilots a boardgame.io client
 * via a game-supplied `selectMove` callback.
 *
 * Per docs/ai-opponent-plan.md (D1): we DON'T use bg.io's built-in
 * bot driver. bg.io's driver fires when `ctx.currentPlayer` matches
 * the bot's playerID; our engines (L5R specifically) don't use bg.io's
 * turn system, so the driver would never fire. Instead, this hook
 * watches the client's state directly and dispatches the bot's move
 * whenever the game tells us it's the bot's turn.
 *
 * Per-game integration: the caller supplies:
 *   - `enabled` — true when the bot should currently be acting (the
 *     caller computes this from mode + game state).
 *   - `G` — the current state (drives re-evaluation on state change).
 *   - `moves` — bg.io's dispatcher object.
 *   - `selectMove(G)` — pure function returning either a
 *     `{ move, args }` record or `null` (no move yet / wait).
 *
 * The hook also accepts a `delayMs` (default 400, per D4) so each
 * dispatch waits long enough for the human to follow the AI's
 * actions in the log, and a `maxMovesPerTurn` cap (default 50) as a
 * runaway-loop backstop — if the bot's policy keeps picking moves
 * the engine rejects, the cap aborts after that many tries and the
 * driver waits for the activePlayer to change before resetting.
 *
 * Per CLAUDE.md: framework code, no imports from games/.
 */
import * as React from 'react'

/** A move ready to dispatch via `moves[move](...args)`. */
export interface DispatchableMove {
  move: string
  args: unknown[]
}

/** Generic "active player" extractor — needed for the per-turn move
 *  counter reset. Games can supply their own; defaults to reading
 *  `G.activePlayer` (a string) which is what L5R uses. The string is
 *  only compared for equality, so the exact type doesn't matter. */
export type ActivePlayerLens<G> = (G: G) => string | number | null

export interface UseAIDriverProps<G> {
  /** When true, the driver actively considers firing. False = no-op
   *  (and the per-turn move counter resets so re-entry starts fresh). */
  enabled: boolean
  /** Current game state. */
  G: G
  /** bg.io moves dispatcher — `moves[name](...args)`. */
  moves: Record<string, (...args: unknown[]) => void>
  /** Pure function: pick the next move for the bot, or null to wait. */
  selectMove: (G: G) => DispatchableMove | null
  /** Delay before each dispatch in ms. Per D4: ~400. */
  delayMs?: number
  /** Max moves dispatched per "turn" (resets when activePlayer
   *  changes). Guards against runaway loops if selectMove keeps
   *  returning the same move the engine rejects. */
  maxMovesPerTurn?: number
  /** Optional lens to read activePlayer from G — for the cap reset.
   *  Defaults to `G.activePlayer`. */
  activePlayerLens?: ActivePlayerLens<G>
  /** Optional console-prefix tag for diagnostics. */
  tag?: string
}

const DEFAULT_DELAY_MS = 400
const DEFAULT_MAX_MOVES_PER_TURN = 50

function defaultActivePlayer<G>(G: G): string | null {
  if (G && typeof G === 'object' && 'activePlayer' in G) {
    const v = (G as { activePlayer: unknown }).activePlayer
    if (typeof v === 'string' || typeof v === 'number') return String(v)
  }
  return null
}

/**
 * Mount-and-forget driver hook. Returns nothing — observable behavior
 * is entirely through dispatched moves.
 */
export function useAIDriver<G>({
  enabled, G, moves, selectMove,
  delayMs = DEFAULT_DELAY_MS,
  maxMovesPerTurn = DEFAULT_MAX_MOVES_PER_TURN,
  activePlayerLens,
  tag = 'aiDriver',
}: UseAIDriverProps<G>): void {
  // Refs (don't add to effect deps) — let the latest closure see the
  // current selectMove / moves without re-firing the effect just
  // because their identity changed.
  const selectMoveRef = React.useRef(selectMove)
  selectMoveRef.current = selectMove
  const movesRef = React.useRef(moves)
  movesRef.current = moves
  const lensRef = React.useRef<ActivePlayerLens<G>>(activePlayerLens ?? (defaultActivePlayer as ActivePlayerLens<G>))
  lensRef.current = activePlayerLens ?? (defaultActivePlayer as ActivePlayerLens<G>)

  const moveCountRef = React.useRef(0)
  const lastActiveRef = React.useRef<string | number | null>(null)
  const capWarnedRef = React.useRef(false)

  React.useEffect(() => {
    if (!enabled) {
      // Disable resets the per-turn counter so re-enabling later
      // starts from zero.
      moveCountRef.current = 0
      capWarnedRef.current = false
      return
    }

    // Reset counter when the active player (or whatever the lens
    // returns) changes — a new turn cycle gets a fresh allotment.
    const active = lensRef.current(G)
    if (lastActiveRef.current !== active) {
      moveCountRef.current = 0
      capWarnedRef.current = false
      lastActiveRef.current = active
    }

    if (moveCountRef.current >= maxMovesPerTurn) {
      if (!capWarnedRef.current) {
        capWarnedRef.current = true
        // eslint-disable-next-line no-console
        console.warn(
          `[${tag}] hit per-turn move cap (${maxMovesPerTurn}); ` +
          `aborting until activePlayer changes`,
        )
      }
      return
    }

    const chosen = selectMoveRef.current(G)
    if (!chosen) return

    const timer = setTimeout(() => {
      const fn = movesRef.current[chosen.move]
      if (typeof fn !== 'function') {
        // eslint-disable-next-line no-console
        console.warn(`[${tag}] no move handler for "${chosen.move}"`)
        return
      }
      moveCountRef.current++
      try {
        fn(...chosen.args)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[${tag}] dispatch threw for "${chosen.move}":`, e)
      }
    }, delayMs)

    return () => clearTimeout(timer)
  }, [enabled, G, delayMs, maxMovesPerTurn, tag])
}
