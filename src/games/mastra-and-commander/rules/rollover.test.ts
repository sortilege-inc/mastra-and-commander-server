/**
 * Round close: the success ladder's consequences, relay/Durable, and the
 * match end (design §4).
 */
import { describe, expect, it } from 'vitest'
import { MATCH_ROUNDS } from '../constants'
import { enterEvalCheck, roundRollover } from './phaseHelpers'
import { scrapForEntropy } from './evalMoves'
import { emptyGameState, placeInContext } from '../testing/fixtures'
import type { MCState } from '../types'

const mv = (G: MCState) => ({ G, playerID: '0' })

/** Put the state at the end of a round with a known tier. */
function atEvalCheck(G: MCState, evalId: string): void {
  G.phase = 'response'
  G.currentEvalId = evalId
  enterEvalCheck(G)
}

describe('eval check scoring on entry', () => {
  it('records a pass and leaves no scrap gate', () => {
    const G = emptyGameState()
    // TEST-EV-PAIR-SHAPES wants two contributions sharing a shape.
    placeInContext(G, 'TEST-OP-AGENT')      // cyan circle
    placeInContext(G, 'TEST-OP-WORKFLOW-A') // amber circle
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')

    expect(G.roundResults[0]!.tier).toBe('best')
    expect(G.pendingFailureScrap).toBeNull()
  })

  it('opens the scrap gate on a failure', () => {
    const G = emptyGameState()
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES') // nothing played — cannot match

    expect(G.roundResults[0]!.tier).toBe('failure')
    expect(G.pendingFailureScrap).not.toBeNull()
  })
})

describe('Entropy persistence', () => {
  it('returns resolved Entropy to the stack after a failure', () => {
    const G = emptyGameState()
    G.entropyResolved = ['TEST-EN-STATIC', 'TEST-EN-HALLUCINATION']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES') // failure
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.entropyStack).toEqual(['TEST-EN-STATIC', 'TEST-EN-HALLUCINATION'])
    expect(G.entropyResolved).toEqual([])
  })

  it('discards resolved Entropy after a pass', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    placeInContext(G, 'TEST-OP-WORKFLOW-A')
    G.entropyResolved = ['TEST-EN-STATIC']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES') // best
    roundRollover(G)

    expect(G.entropyStack).toEqual([])
    expect(G.entropyDiscard).toEqual(['TEST-EN-STATIC'])
  })

  it('feeds extra Entropy after a sloppy (lesser) pass', () => {
    const G = emptyGameState()
    // Five cards clears the pattern but blows past par 3 → lesser.
    for (const id of [
      'TEST-OP-AGENT', 'TEST-OP-WORKFLOW-A', 'TEST-OP-WORKFLOW-B',
      'TEST-OP-WORKFLOW-C', 'TEST-OP-SCRATCHPAD',
    ]) placeInContext(G, id)
    G.entropyDeck = ['TEST-EN-STATIC']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    expect(G.roundResults[0]!.tier).toBe('lesser')

    roundRollover(G)
    expect(G.entropyStack).toEqual(['TEST-EN-STATIC'])
  })
})

describe('scrapping to shed Entropy', () => {
  it('a Setup card removes 5', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-SETUP-PIPELINE')
    G.entropyResolved = Array(6).fill('TEST-EN-STATIC')
    atEvalCheck(G, 'TEST-EV-FLUSH-5') // failure

    scrapForEntropy(mv(G), 'TEST-OP-SETUP-PIPELINE')
    expect(G.entropyResolved).toHaveLength(1)
    expect(G.operatorDiscard).toContain('TEST-OP-SETUP-PIPELINE')
  })

  it('a Durable card removes 3', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-DURABLE-AGENT')
    G.entropyResolved = Array(5).fill('TEST-EN-STATIC')
    atEvalCheck(G, 'TEST-EV-FLUSH-5')

    scrapForEntropy(mv(G), 'TEST-OP-DURABLE-AGENT')
    expect(G.entropyResolved).toHaveLength(2)
  })

  it('refuses to scrap a card with neither keyword', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    G.entropyResolved = ['TEST-EN-STATIC']
    atEvalCheck(G, 'TEST-EV-FLUSH-5')

    const result = scrapForEntropy(mv(G), 'TEST-OP-AGENT')
    expect(result).toBeDefined() // INVALID_MOVE
    expect(G.entropyResolved).toHaveLength(1)
  })
})

describe('Context teardown and relay', () => {
  it('discards everything not relayed (stateless by default)', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.contexts[0]!.slots).toHaveLength(0)
    expect(G.operatorDiscard).toContain('TEST-OP-AGENT')
  })

  it('relays a marked card and feeds Entropy for it when not Durable', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    G.contexts[0]!.slots[0]!.relayed = true
    G.entropyDeck = ['TEST-EN-STATIC']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.contexts[0]!.slots.map((s) => s.cardId)).toEqual(['TEST-OP-AGENT'])
    // The relay tax was paid.
    expect(G.entropyStack).toEqual(['TEST-EN-STATIC'])
  })

  it('relays a Durable card for free', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-DURABLE-AGENT')
    G.contexts[0]!.slots[0]!.relayed = true
    G.entropyDeck = ['TEST-EN-STATIC']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.contexts[0]!.slots).toHaveLength(1)
    // No relay tax — the deck is untouched.
    expect(G.entropyStack).toEqual([])
    expect(G.entropyDeck).toEqual(['TEST-EN-STATIC'])
  })

  it('collapses parallel Processes back to one', () => {
    const G = emptyGameState()
    G.contexts.push({ slots: [], closed: false, ceiling: 7, parentChainIx: null, ownerCardId: null })
    G.processLimit = 2
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.contexts).toHaveLength(1)
    expect(G.processLimit).toBe(1)
  })
})

describe('round-scoped state clears', () => {
  it('clears pollution, the round pool, and the feed counter', () => {
    const G = emptyGameState()
    G.injectedContributions = [{ color: 'pink', shape: 'hexagon' }]
    G.roundPool.technology = 3
    G.entropyFedThisRound = 4
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.injectedContributions).toEqual([])
    expect(G.entropyFedThisRound).toBe(0)
    // enterReveal for the new round may have granted pool from equipment, but
    // the OLD pool value is gone.
    expect(G.roundPool.technology).toBeLessThan(3)
  })

  it('refreshes Features each eval', () => {
    const G = emptyGameState()
    G.activeFeatureIds = ['TEST-FEAT-STREAMING']
    G.featureOffer = ['TEST-FEAT-CACHING']
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.activeFeatureIds).toEqual([])
    // Back in circulation — either still in the deck, or already re-dealt into
    // the next round's offer (the features deck is small enough that it will
    // usually be the latter).
    expect([...G.featuresDeck, ...G.featureOffer]).toContain('TEST-FEAT-STREAMING')
  })
})

describe('match end', () => {
  it('ends the match after MATCH_ROUNDS and names a winner', () => {
    const G = emptyGameState()
    G.round = MATCH_ROUNDS
    // Three prior passes + this one → Operator wins.
    G.roundResults = [
      { round: 1, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'best', contextSize: 2 },
      { round: 2, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'best', contextSize: 2 },
      { round: 3, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'lesser', contextSize: 5 },
      { round: 4, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'failure', contextSize: 0 },
    ]
    placeInContext(G, 'TEST-OP-AGENT')
    placeInContext(G, 'TEST-OP-WORKFLOW-A')
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    roundRollover(G)

    expect(G.matchWinner).toBe('operator')
    expect(G.round).toBe(MATCH_ROUNDS)
  })

  it('awards the match to Entropy when the Operator falls short', () => {
    const G = emptyGameState()
    G.round = MATCH_ROUNDS
    G.roundResults = [
      { round: 1, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'failure', contextSize: 0 },
      { round: 2, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'failure', contextSize: 0 },
      { round: 3, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'failure', contextSize: 0 },
      { round: 4, evalId: 'TEST-EV-PAIR-SHAPES', tier: 'best', contextSize: 2 },
    ]
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES') // failure
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.matchWinner).toBe('entropy')
  })

  it('opens the next round otherwise', () => {
    const G = emptyGameState()
    G.round = 1
    atEvalCheck(G, 'TEST-EV-PAIR-SHAPES')
    G.pendingFailureScrap = null
    roundRollover(G)

    expect(G.round).toBe(2)
    expect(G.phase).toBe('reveal')
    expect(G.matchWinner).toBeNull()
  })
})
