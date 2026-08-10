/**
 * Test fixtures.
 *
 * `freshGameState()` builds from the REAL setup path, so fixtures can't rot as
 * the state shape grows — a field added to MCState appears here automatically.
 * (Same reasoning as tcggg's testing/fixtures.ts.)
 */
import type { CallTarget, MCState } from '../types'
import { DEFAULT_CONTEXT_CEILING } from '../constants'
import { buildInitialState, type RandomAPI } from '../rules/setup'
import { enterReveal } from '../rules/phaseHelpers'
import { zeroPips } from '../rules/ioFlow'

/** Deterministic stand-in for boardgame.io's random plugin. */
export function seededRandom(): RandomAPI & { Die: (n: number) => number } {
  let seed = 12345
  const next = (): number => {
    // xorshift — deterministic and dependency-free.
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return Math.abs(seed)
  }
  return {
    Shuffle<T>(deck: T[]): T[] {
      const out = [...deck]
      for (let i = out.length - 1; i > 0; i--) {
        const j = next() % (i + 1)
        const a = out[i]!
        const b = out[j]!
        out[i] = b
        out[j] = a
      }
      return out
    },
    Die: (n: number) => (next() % n) + 1,
  }
}

/** A game at the start of round 1, with the Reveal engine already run. */
export function freshGameState(): MCState {
  const G = buildInitialState(seededRandom())
  enterReveal(G)
  return G
}

/**
 * A game state with a known, controlled shape for rules tests — empty zones so
 * a test can place exactly what it needs without fighting the shuffle.
 */
export function emptyGameState(): MCState {
  const G = freshGameState()
  G.operatorHand = []
  // A small stock deck. NOT empty: an empty deck now means "the Operator has
  // cycled their deck", which ends the match — so a zero-length deck here would
  // silently end every test that rolls a round over. Tests that specifically
  // want an exhausted deck set it themselves.
  G.operatorDeck = Array(20).fill('TEST-OP-SCRATCHPAD')
  // enterReveal has already run the equipment auto-pitch, so the discard is
  // non-empty by the time we get here. Clear it so tests start from zero.
  G.operatorDiscard = []
  G.contexts = [{
    slots: [],
    closed: false,
    ceiling: DEFAULT_CONTEXT_CEILING,
    parentChainIx: null,
    ownerCardId: null,
  }]
  G.entropyStack = []
  G.entropyResolved = []
  G.entropyDeck = []
  G.roundPool = zeroPips()
  G.injectedContributions = []
  G.pendingFeaturePicks = null
  G.pendingEntropyTarget = null
  G.pendingFailureScrap = null
  G.log = []
  return G
}

/** Put a card into the Context with given unspent outputs. */
export function placeInContext(
  G: MCState,
  cardId: string,
  outputs = zeroPips(),
  chainIx = 0,
): void {
  G.contexts[chainIx]!.slots.push({
    cardId,
    faceDown: false,
    calls: null,
    outputsRemaining: outputs,
    relayed: false,
    subverted: false,
  })
}

/** Put a face-down CALL slot into the Context, invoking an installed resource. */
export function placeCall(G: MCState, cardId: string, calls: CallTarget, chainIx = 0): void {
  G.contexts[chainIx]!.slots.push({
    cardId,
    faceDown: true,
    calls,
    outputsRemaining: zeroPips(),
    relayed: false,
    subverted: false,
  })
}
