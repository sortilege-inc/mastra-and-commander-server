/**
 * Initial game state.
 *
 * Called from Game.ts's `setup`. Randomness comes from boardgame.io's
 * `ctx.random` plugin (never Math.random) so games stay reproducible for the
 * replay verifier and saved games.
 */
import {
  COMMANDER_ID, DEFAULT_PROCESS_LIMIT, LOADOUT_IDS, STARTING_HAND_SIZE,
  STARTING_MODEL_ID,
} from '../constants'
import type { MCState } from '../types'
import {
  ENTROPY_DECK_LIST, EVAL_CARDS, FEATURE_CARDS, OPERATOR_DECK_LIST, expandDeckList,
} from '../cards/testSet'
import { zeroPips } from './ioFlow'

/** The slice of boardgame.io's random plugin we use. */
export interface RandomAPI {
  Shuffle: <T>(deck: T[]) => T[]
}

export function buildInitialState(random: RandomAPI): MCState {
  const operatorDeck = random.Shuffle(expandDeckList(OPERATOR_DECK_LIST))
  const entropyDeck = random.Shuffle(expandDeckList(ENTROPY_DECK_LIST))
  const evalDeck = random.Shuffle(EVAL_CARDS.map((e) => e.id))
  const featuresDeck = random.Shuffle(FEATURE_CARDS.map((f) => f.id))

  // Opening hand off the top of the shuffled deck.
  const operatorHand = operatorDeck.splice(0, STARTING_HAND_SIZE)

  const state: MCState = {
    round: 1,
    // The reveal-phase engine runs on entry; Game.ts calls enterReveal after
    // building this so round 1 is set up exactly like every later round.
    phase: 'reveal',
    roundResults: [],
    matchWinner: null,
    log: ['Game begins.'],

    operatorDeck,
    operatorHand,
    operatorDiscard: [],
    contexts: [{ slots: [], closed: false }],
    processLimit: DEFAULT_PROCESS_LIMIT,
    commanderId: COMMANDER_ID,
    loadout: [...LOADOUT_IDS],
    installedModelId: STARTING_MODEL_ID,
    roundPool: zeroPips(),
    servers: [],

    ragSteps: [],
    ragLockedContribution: null,

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
