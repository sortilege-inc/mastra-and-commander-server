/**
 * Mastra & Commander — boardgame.io game definition.
 *
 * This file is a MANIFEST, not an implementation: setup, turn config, and a
 * moves map of imported identifiers. Every move body lives in `rules/*Moves.ts`
 * with its pure helpers in `rules/*Helpers.ts`. (Pattern borrowed from tcggg's
 * L5R engine, where inlining move bodies here produced an unmaintainable
 * thousand-line file.)
 *
 * WHY NO boardgame.io `phases`:
 * The round loop lives in a flat `G.phase` field advanced by the `advancePhase`
 * move. bg.io's `phases` scope the moves map and interact with turn order, but
 * this game needs BOTH seats live inside a single phase — during the Entropy
 * phase the Entropy player picks targets while the Operator draws a card per
 * Entropy resolved. Modeling that with phases means constant `activePlayers`
 * stage churn; a flat phase field with per-move guards is simpler and is what
 * the pending-gate pattern wants anyway.
 *
 * State is JSON-serializable throughout — see types.ts.
 */
import type { Game } from 'boardgame.io'
import type { MCState } from './types'
import { buildInitialState } from './rules/setup'
import { enterReveal } from './rules/phaseHelpers'
import { playerView } from './playerView'

// ── Moves ───────────────────────────────────────────────────────────────
import { advancePhase } from './rules/phaseMoves'
import { pickFeature, skipFeaturePicks } from './rules/revealMoves'
import {
  advanceRag, attachSkill, callInstalled, closeProcess, installServer, loadClaw,
  openProcess, playEvent, playToContext, upgradeModel,
} from './rules/playMoves'
import {
  autoResolveEntropyTarget, chooseEntropyTarget, resolveNextEntropy,
} from './rules/entropyMoves'
import { playResponse } from './rules/responseMoves'
import { acceptOutcome, scrapForEntropy, toggleRelay } from './rules/evalMoves'

export type { MCState }

export const MastraCommander: Game<MCState> = {
  name: 'mastra-and-commander',

  // Asymmetric, fixed sides (design §3): seat '0' is the Operator, seat '1' is
  // Entropy. Solo play drives seat '1' from the Board (design §3: the Entropy
  // deck "runs itself").
  minPlayers: 2,
  maxPlayers: 2,

  setup: ({ random }) => {
    const G = buildInitialState(random)
    // Round 1's Reveal runs through the same engine as every later round.
    enterReveal(G)
    return G
  },

  // Both seats are always eligible to act; each move guards on phase, seat, and
  // open gates. See the header for why this replaces bg.io phases.
  turn: {
    activePlayers: { all: 'play' },
  },

  playerView: ({ G, playerID }) => playerView(G, playerID),

  moves: {
    // ── Round loop ────────────────────────────────────────────────────
    advancePhase,

    // ── Phase 1 · Reveal — see rules/revealMoves.ts ────────────────────
    pickFeature,
    skipFeaturePicks,

    // ── Phase 2 · Play — see rules/playMoves.ts ────────────────────────
    playToContext,
    /** Face-down play that invokes an installed Tool / Skill / RAG. */
    callInstalled,
    playEvent,
    /** Tool + face-down substrate → a persistent, Durable MCP server. */
    installServer,
    /** Skill → rig or cloud, gaining Durable. */
    attachSkill,
    /** Advance the RAG saga one chapter. */
    advanceRag,
    loadClaw,
    upgradeModel,
    openProcess,
    closeProcess,

    // ── Phase 3 · Entropy — see rules/entropyMoves.ts ──────────────────
    resolveNextEntropy,
    chooseEntropyTarget,
    autoResolveEntropyTarget,

    // ── Phase 4 · Response — see rules/responseMoves.ts ────────────────
    playResponse,

    // ── Phase 5 · Eval check — see rules/evalMoves.ts ──────────────────
    toggleRelay,
    scrapForEntropy,
    acceptOutcome,
  },

  endIf: ({ G }) => {
    if (G.matchWinner) return { winner: G.matchWinner }
    return undefined
  },
}
