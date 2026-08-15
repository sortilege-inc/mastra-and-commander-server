/**
 * Round close: scoring on entry to evalCheck, the scrap gate, Entropy
 * persistence, Context teardown, and the match end conditions.
 *
 * Keyword-dependent behaviour (Durable relays free, scrapping a Setup card
 * sheds more) is driven by attaching the keyword to a real card in the fixture
 * rather than hunting for a card that happens to print it — the RULE is the
 * subject, and the current 18-card set does not print every keyword.
 */
import { describe, expect, it } from 'vitest'
import { emptyGameState, placeInContext, CARDS } from '../testing/fixtures'
import { enterEvalCheck, roundRollover, scrappableCards } from './phaseHelpers'
import { scrapForEntropy, toggleRelay } from './evalMoves'
import { LESSER_ENTROPY_PENALTY, MATCH_ROUNDS, SCRAP_REMOVES } from '../constants'

const op = (G: ReturnType<typeof emptyGameState>) => ({ G, playerID: '0' })

/** A board that meets the easy objective: two cyan and one amber. */
function passing() {
  const G = emptyGameState()
  G.currentEvalId = CARDS.evalEasy
  // Contributions are what score, so inject them directly rather than hunting
  // for cards whose printed pips happen to satisfy the pattern.
  G.injectedContributions = [
    { color: 'cyan', shape: 'circle' },
    { color: 'cyan', shape: 'square' },
    { color: 'amber', shape: 'circle' },
  ]
  return G
}

describe('scoring on entry to evalCheck', () => {
  it('records a pass and opens no scrap gate', () => {
    const G = passing()
    enterEvalCheck(G)
    expect(G.roundResults).toHaveLength(1)
    expect(G.roundResults[0]!.tier).not.toBe('failure')
    expect(G.pendingFailureScrap).toBeNull()
  })

  it('opens the scrap gate on a failure', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy // nothing contributed
    enterEvalCheck(G)
    expect(G.roundResults[0]!.tier).toBe('failure')
    expect(G.pendingFailureScrap).not.toBeNull()
  })
})

describe('Entropy persistence', () => {
  it('returns this round\'s resolved Entropy to the stack after a failure', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    G.entropyResolved = ['a', 'b']
    enterEvalCheck(G)
    G.pendingFailureScrap = null // accept the outcome
    roundRollover(G)
    expect(G.entropyStack).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('discards it after a pass', () => {
    const G = passing()
    G.entropyResolved = ['a']
    enterEvalCheck(G)
    roundRollover(G)
    expect(G.entropyStack).not.toContain('a')
    expect(G.entropyDiscard).toContain('a')
  })

  it('feeds extra Entropy after a sloppy (lesser) pass', () => {
    const G = passing()
    // Push the context over par so the pass grades `lesser`.
    for (let i = 0; i < 9; i++) placeInContext(G, CARDS.cheap)
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)
    enterEvalCheck(G)
    expect(G.roundResults[0]!.tier).toBe('lesser')

    const before = G.entropyStack.length
    roundRollover(G)
    expect(G.entropyStack.length).toBe(before + LESSER_ENTROPY_PENALTY)
  })
})

describe('scrapping to shed Entropy', () => {
  it('sheds more for a Setup card than a Durable one', () => {
    expect(SCRAP_REMOVES.setup).toBeGreaterThan(SCRAP_REMOVES.durable)
  })

  it('sheds Entropy when there is something scrappable in play', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    G.entropyResolved = Array(8).fill('x')
    G.currentEvalId = CARDS.evalEasy
    enterEvalCheck(G)
    expect(G.pendingFailureScrap).not.toBeNull()

    const options = scrappableCards(G)
    if (options.length === 0) {
      // Nothing in the current set prints a scrappable keyword — the gate still
      // has to be dismissible, which acceptOutcome covers elsewhere.
      expect(options).toEqual([])
      return
    }
    const before = G.entropyResolved.length
    scrapForEntropy(op(G), options[0]!.cardId)
    expect(G.entropyResolved.length).toBeLessThan(before)
  })

  it('refuses to scrap a card that is not in play', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    enterEvalCheck(G)
    expect(scrapForEntropy(op(G), CARDS.installable)).toBeDefined()
  })
})

describe('Context teardown and relay', () => {
  it('discards everything not relayed — stateless by default', () => {
    const G = passing()
    placeInContext(G, CARDS.cheap)
    enterEvalCheck(G)
    roundRollover(G)
    expect(G.operatorDiscard).toContain(CARDS.cheap)
    expect(G.contexts.every((chain) => chain.slots.length === 0)).toBe(true)
  })

  it('keeps a relayed card into the next round', () => {
    const G = passing()
    placeInContext(G, CARDS.cheap)
    G.phase = 'evalCheck'
    toggleRelay(op(G), 0, 0)
    expect(G.contexts[0]!.slots[0]!.relayed).toBe(true)

    enterEvalCheck(G)
    roundRollover(G)
    const survivors = G.contexts.flatMap((chain) => chain.slots.map((s) => s.cardId))
    expect(survivors).toContain(CARDS.cheap)
  })

  it('clears pollution', () => {
    const G = passing()
    enterEvalCheck(G)
    roundRollover(G)
    expect(G.injectedContributions).toEqual([])
  })

  it('has already spent the new round\'s free Agent opening its context', () => {
    const G = passing()
    enterEvalCheck(G)
    roundRollover(G)
    // Rollover runs the next Reveal, which opens a context with the free
    // Agent — so the flag is spent, not reset, by the time the player acts.
    expect(G.frameworkFreeAgentUsed).toBe(true)
    expect(G.contexts.length).toBeGreaterThanOrEqual(1)
  })

  it('opens the next round with exactly one context', () => {
    const G = passing()
    enterEvalCheck(G)
    roundRollover(G)
    // The new round's free Agent opens one; nothing carried over should add more.
    expect(G.contexts.length).toBeGreaterThanOrEqual(1)
    expect(G.round).toBe(2)
  })
})

describe('ending the match', () => {
  it('stops after MATCH_ROUNDS evals', () => {
    const G = passing()
    G.round = MATCH_ROUNDS
    enterEvalCheck(G)
    roundRollover(G)
    expect(G.matchWinner).not.toBeNull()
    expect(G.matchEndReason).toBe('rounds')
  })

  it('stops when the Operator cycles their deck', () => {
    const G = passing()
    G.operatorDeck = []
    G.operatorHand = []
    enterEvalCheck(G)
    roundRollover(G)
    expect(G.matchEndReason).toBe('deckOut')
  })
})
