/**
 * Scaffold game: Mastra & Commander.
 *
 * This is the play-engine analogue of tcggg's TicTacToe hello-world — it
 * exists to prove the client / state / phase wiring is healthy end-to-end
 * before the real engine is modeled. It deliberately implements NO card
 * mechanics: the design (../../../../mastra-and-commander/cards/game-design.md)
 * is still mostly proposed (🟨) / open (❓), and inventing rules here would
 * be guesswork.
 *
 * What it DOES model is the one thing that's locked (🔒): the **round loop**
 * from game-design.md §2, as boardgame.io phases:
 *
 *   1. reveal    — Reveal an Objective from the Eval deck.
 *   2. play      — Operator builds the Context (pitch to pay, draw per pitch);
 *                  plays/pitches feed the Entropy economy.
 *   3. entropy   — Resolve accumulated Entropy in reverse order (LIFO);
 *                  draw one per Entropy resolved.
 *   4. response  — Operator plays responses to mitigate the Entropy.
 *   5. evalCheck — Compare the Context's contributions to the Objective and
 *                  resolve on the success ladder.
 *
 * `advance` steps to the next phase; after evalCheck the loop returns to
 * reveal for the next round (bumping the round counter). No win condition
 * yet — a scaffold cycles indefinitely until the real Eval check lands.
 *
 * Move-function signature (boardgame.io v0.50):
 *   ({ G, ctx, events, ...pluginAPIs, playerID }, ...args) => void | INVALID_MOVE
 * State mutates in-place via `G` (Immer under the hood).
 */
import type { Game } from 'boardgame.io'

/** The five locked round-loop phases, in order (game-design.md §2). */
export const ROUND_PHASES = ['reveal', 'play', 'entropy', 'response', 'evalCheck'] as const
export type RoundPhase = typeof ROUND_PHASES[number]

export interface MastraCommanderState {
  /** 1-based round number; bumped each time the loop re-enters `reveal`. */
  round: number
  /** Human-readable trail of phase transitions, for the scaffold board. */
  log: string[]
}

/** Prose shown on the scaffold board for each phase (from §2). */
export const PHASE_BLURB: Record<RoundPhase, string> = {
  reveal: 'Reveal an Objective from the Eval deck (the target hand).',
  play: 'Operator builds the Context: pitch cards to pay costs, draw one per pitch. Plays and pitches feed the Entropy economy.',
  entropy: 'Resolve the accumulated Entropy in reverse order (LIFO). Draw one card per Entropy resolved.',
  response: 'Operator plays responses to mitigate what the Entropy did.',
  evalCheck: "Compare the Context's contributions to the Objective and resolve on the success ladder.",
}

/** Shared move: end the current phase. Each phase declares `next`, so
 *  boardgame.io routes to the correct successor. */
const advance = ({ G, ctx, events }: { G: MastraCommanderState; ctx: { phase: string }; events: { endPhase: () => void } }) => {
  G.log.push(`round ${G.round}: leaving “${ctx.phase}”`)
  events.endPhase()
}

export const MastraCommander: Game<MastraCommanderState> = {
  name: 'mastra-and-commander',
  // Asymmetric duel: Operator (P0) vs Entropy (P1). Solo play (design §3)
  // will drive P1 from an automated Entropy deck later.
  minPlayers: 2,
  maxPlayers: 2,

  setup: () => ({
    round: 1,
    log: ['round 1: revealed objective'],
  }),

  phases: {
    reveal: {
      start: true,
      next: 'play',
      moves: { advance },
    },
    play: {
      next: 'entropy',
      moves: { advance },
    },
    entropy: {
      next: 'response',
      moves: { advance },
    },
    response: {
      next: 'evalCheck',
      moves: { advance },
    },
    evalCheck: {
      next: 'reveal',
      moves: { advance },
      // Leaving evalCheck closes the round; re-entering reveal opens the next.
      onEnd: ({ G }) => {
        G.round += 1
        G.log.push(`round ${G.round}: revealed objective`)
      },
    },
  },
}
