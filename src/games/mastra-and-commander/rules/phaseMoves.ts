/**
 * `advancePhase` — the round-loop state machine.
 *
 * This is the one move with a gating preamble: no phase may be left while a
 * `pending*` gate is open, and the Entropy phase additionally requires the
 * stack to be empty (design §2: Entropy is resolved, in full, before the
 * Response phase).
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { ROUND_PHASES } from '../constants'
import type { MCState } from '../types'
import {
  enterEntropy, enterEvalCheck, enterPlay, enterResponse, roundRollover,
} from './phaseHelpers'
import { log } from './playHelpers'
import type { MoveCtx } from './playMoves'

/** True while any gate blocks progress. Mirrors GATE_MANIFEST in gates.ts. */
export function hasOpenGate(G: MCState): boolean {
  return G.pendingFeaturePicks !== null
    || G.pendingEntropyTarget !== null
    || G.pendingFailureScrap !== null
}

export function advancePhase({ G, playerID }: MoveCtx) {
  void playerID // either seat may advance; gates are the real guard
  if (G.matchWinner) return INVALID_MOVE
  if (hasOpenGate(G)) return INVALID_MOVE

  // The Entropy stack must be fully resolved before leaving the phase.
  if (G.phase === 'entropy' && G.entropyStack.length > 0) return INVALID_MOVE

  log(G, `leaving ${G.phase}`)

  switch (G.phase) {
    case 'reveal':
      enterPlay(G)
      break
    case 'play':
      enterEntropy(G)
      break
    case 'entropy':
      enterResponse(G)
      break
    case 'response':
      enterEvalCheck(G)
      break
    case 'evalCheck':
      roundRollover(G)
      break
  }
}

/** Exported for the UI/stepper. */
export const PHASE_ORDER = ROUND_PHASES
