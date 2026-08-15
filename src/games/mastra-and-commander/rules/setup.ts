/**
 * Initial game state.
 *
 * Called from Game.ts's `setup`. Randomness comes from boardgame.io's
 * `ctx.random` plugin (never Math.random) so games stay reproducible for the
 * replay verifier and saved games.
 */
import {
  FRAMEWORK_ID, DEFAULT_PROCESS_LIMIT, HAND_SIZE,
  LOADOUT_IDS, STARTING_MODEL_ID,
} from '../constants'
import type { MCState } from '../types'
import { DECK_RECIPE, expandRecipe } from '../cards/cardSet'
import { zeroPips } from './ioFlow'

/** The slice of boardgame.io's random plugin we use. */
export interface RandomAPI {
  Shuffle: <T>(deck: T[]) => T[]
}

export function buildInitialState(random: RandomAPI): MCState {
  // Models, loadouts and features shuffle into the OPERATOR deck as findable
  // upgrades (owner ruling, 2026-08-13) — that is what makes Y-Combinator's
  // tutor meaningful. One loadout and one model are also in play from setup.
  const operatorDeck = random.Shuffle(expandRecipe(DECK_RECIPE.operator))
  const entropyDeck = random.Shuffle(expandRecipe(DECK_RECIPE.entropy))
  const evalDeck = random.Shuffle([...DECK_RECIPE.evals])
  // The Features deck is gone as a separate pile; feature cards are drawn or
  // tutored like anything else. Kept empty so the reveal-phase offer is a no-op.
  const featuresDeck: string[] = []

  // Opening hand off the top of the shuffled deck.
  const operatorHand = operatorDeck.splice(0, HAND_SIZE)

  const state: MCState = {
    round: 1,
    // The reveal-phase engine runs on entry; Game.ts calls enterReveal after
    // building this so round 1 is set up exactly like every later round.
    phase: 'reveal',
    roundResults: [],
    matchWinner: null,
    matchEndReason: null,
    log: ['Game begins.'],

    operatorDeck,
    operatorHand,
    operatorDiscard: [],
    // No rows at setup. A Context row is OWNED by an Agent token (owner ruling,
    // 2026-08-13), and the round opens by putting the first one into play — free
    // via Mastra. enterReveal does that, so round 1 matches every later round.
    contexts: [],
    processLimit: DEFAULT_PROCESS_LIMIT,
    frameworkId: FRAMEWORK_ID,
    loadout: [...LOADOUT_IDS],
    installedModelId: STARTING_MODEL_ID,
    roundPool: zeroPips(),
    servers: [],
    nextServerSeq: 1,
    skillAttachments: [],
    frameworkFreeAgentUsed: false,
    threats: [],
    slotted: [],

    // RAG is part of the initial setup — in play from turn one, unbuilt.
    rag: {
      chaptersComplete: 0,
      upsertCardId: null,
      contribution: [],
      rerankUsed: false,
    },

    clawPile: [],
    clawHand: [],

    featuresDeck,
    featureOffer: [],
    activeFeatureIds: [],
    ignoreNextFeed: false,

    entropyDeck,
    entropyStack: [],
    entropyResolved: [],
    entropyDiscard: [],
    injectedContributions: [],
    entropyFedThisRound: 0,

    evalDeck,
    currentEvalId: null,

    pendingFeaturePicks: null,
    pendingEntropyTarget: null,
    pendingFailureScrap: null,
  }

  return state
}
