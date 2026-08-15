/**
 * Entropy: the feed, LIFO resolution, and the effect DSL.
 *
 * Most of these drive `applyEntropyEffect` with a hand-built effect rather than
 * a real card. That is deliberate: the effect DSL is the unit under test, and
 * the current card set does not print every kind the engine supports (there is
 * no pollute, ecosystemTax or attackServer card in it today). Testing through
 * cards only would silently drop coverage of engine paths that still exist.
 *
 * Card ids appear where the CARD is the subject — the threat row, and which
 * effects persist.
 */
import { describe, expect, it } from 'vitest'
import { emptyGameState, addThreat, addContext, installServerDirect, placeInContext, CARDS }
  from '../testing/fixtures'
import {
  applyEntropyEffect, eligibleTargets, extraFeedFor, highestProducerOf, isTargeted,
  threatBlanksProducersOf,
} from './entropyHelpers'
import { resolveNextEntropy, retainOrDiscard } from './entropyMoves'
import { feedEntropy } from './playHelpers'
import { contextCeiling } from './contextRows'
import { DEFAULT_CONTEXT_CEILING } from '../constants'

const noRandom = () => 0
const op = (G: ReturnType<typeof emptyGameState>) => ({ G, playerID: '0' })

describe('the Entropy feed', () => {
  it('moves cards from the deck onto the stack', () => {
    const G = emptyGameState()
    G.entropyDeck = ['a', 'b', 'c']
    feedEntropy(G, 2, 'test')
    expect(G.entropyStack).toEqual(['a', 'b'])
    expect(G.entropyDeck).toEqual(['c'])
  })

  it('stops at an empty deck rather than throwing', () => {
    const G = emptyGameState()
    G.entropyDeck = ['a']
    expect(feedEntropy(G, 3, 'test')).toBe(1)
    expect(G.entropyStack).toEqual(['a'])
  })

  it('is absorbed once by a shield, then resumes', () => {
    const G = emptyGameState()
    G.entropyDeck = ['a', 'b']
    G.ignoreNextFeed = true
    expect(feedEntropy(G, 1, 'test')).toBe(0)
    expect(feedEntropy(G, 1, 'test')).toBe(1)
  })
})

describe('LIFO resolution', () => {
  it('resolves the most recently fed card first', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyDeck = [CARDS.threatCeiling, CARDS.threatFeed]
    feedEntropy(G, 2, 'test')
    // Stack is [ceiling, feed]; the top is the LAST one fed.
    const top = G.entropyStack[G.entropyStack.length - 1]
    resolveNextEntropy(op(G))
    expect(G.threats.map((t) => t.cardId)).toEqual([top])
  })

  it('draws the Operator one card per Entropy resolved', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = [CARDS.threatCeiling]
    const handBefore = G.operatorHand.length
    resolveNextEntropy(op(G))
    expect(G.operatorHand.length).toBe(handBefore + 1)
  })
})

describe('the effect DSL', () => {
  it('pollute injects junk that the eval will score', () => {
    const G = emptyGameState()
    const junk = [{ color: 'pink' as const, shape: 'hexagon' as const }]
    applyEntropyEffect(G, { kind: 'pollute', junk }, null, noRandom)
    expect(G.injectedContributions).toEqual(junk)
  })

  it('subvert blanks the targeted slot', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    applyEntropyEffect(G, { kind: 'subvert' },
      { kind: 'contextSlot', chainIx: 0, index: 0, label: 'x' }, noRandom)
    expect(G.contexts[0]!.slots[0]!.subverted).toBe(true)
  })

  it('subvert fizzles rather than throwing when its target has gone', () => {
    const G = emptyGameState()
    expect(() => applyEntropyEffect(G, { kind: 'subvert' },
      { kind: 'contextSlot', chainIx: 0, index: 9, label: 'gone' }, noRandom)).not.toThrow()
  })

  it('attackServer destroys the server and discards both its cards', () => {
    const G = emptyGameState()
    const server = installServerDirect(G)
    applyEntropyEffect(G, { kind: 'attackServer' },
      { kind: 'server', serverId: server.id, label: 'x' }, noRandom)
    expect(G.servers).toHaveLength(0)
    expect(G.operatorDiscard).toContain(server.traitCardId)
    expect(G.operatorDiscard).toContain(server.substrateCardId)
  })

  it('feedExtra grows the stack mid-resolution', () => {
    const G = emptyGameState()
    G.entropyDeck = ['x', 'y']
    applyEntropyEffect(G, { kind: 'feedExtra', n: 2 }, null, noRandom)
    expect(G.entropyStack).toEqual(['x', 'y'])
  })

  it('discardRandomFromHand takes exactly one card', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.cheap, CARDS.installable]
    applyEntropyEffect(G, { kind: 'discardRandomFromHand' }, null, noRandom)
    expect(G.operatorHand).toHaveLength(1)
    expect(G.operatorDiscard).toHaveLength(1)
  })
})

describe('the constrained hijack (Algorithmic Intervention)', () => {
  it('fizzles when no objective is close enough', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    G.evalDeck = [CARDS.evalHard] // differs by 5
    applyEntropyEffect(G, { kind: 'hijack', maxDifference: 2 }, null, noRandom)
    expect(G.currentEvalId).toBe(CARDS.evalEasy)
  })

  it('swaps to a near neighbour when one exists', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    G.evalDeck = [CARDS.evalHard]
    // A generous threshold makes the far objective legal, proving the swap
    // itself works — the threshold is what the card sets, not the mechanism.
    applyEntropyEffect(G, { kind: 'hijack', maxDifference: 9 }, null, noRandom)
    expect(G.currentEvalId).toBe(CARDS.evalHard)
    expect(G.evalDeck).toContain(CARDS.evalEasy)
  })
})

describe('targeting', () => {
  it('knows which effects need a target', () => {
    expect(isTargeted({ kind: 'subvert' })).toBe(true)
    expect(isTargeted({ kind: 'attackServer' })).toBe(true)
    expect(isTargeted({ kind: 'pollute', junk: [] })).toBe(false)
  })

  it('offers every un-subverted slot, in a stable order', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    placeInContext(G, CARDS.installable)
    const targets = eligibleTargets(G, { kind: 'subvert' })
    expect(targets).toHaveLength(2)
    // Stable ordering matters: solo play auto-picks the first.
    expect(targets[0]).toMatchObject({ kind: 'contextSlot', chainIx: 0, index: 0 })
  })

  it('offers nothing once every slot is already subverted', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    G.contexts[0]!.slots[0]!.subverted = true
    expect(eligibleTargets(G, { kind: 'subvert' })).toHaveLength(0)
  })
})

describe('the threat row', () => {
  it('keeps an Ongoing card instead of discarding it', () => {
    const G = emptyGameState()
    retainOrDiscard(G, CARDS.threatCeiling)
    expect(G.threats.map((t) => t.cardId)).toEqual([CARDS.threatCeiling])
    expect(G.entropyResolved).toHaveLength(0)
  })

  it('keeps an Initialize card too — it stays in play after firing', () => {
    const G = emptyGameState()
    retainOrDiscard(G, CARDS.initialize)
    expect(G.threats.map((t) => t.cardId)).toEqual([CARDS.initialize])
  })

  it('reduces every context ceiling, nested ones included', () => {
    const G = emptyGameState()
    addContext(G, 0)
    expect(contextCeiling(G)).toBe(DEFAULT_CONTEXT_CEILING)

    addThreat(G, CARDS.threatCeiling)
    expect(contextCeiling(G)).toBe(DEFAULT_CONTEXT_CEILING - 1)
  })

  it('never reduces a ceiling below one card', () => {
    const G = emptyGameState()
    for (let i = 0; i < DEFAULT_CONTEXT_CEILING + 3; i++) {
      addThreat(G, CARDS.threatCeiling)
    }
    expect(contextCeiling(G)).toBe(1)
  })

  it('blanks the class of card its Ongoing names', () => {
    const G = emptyGameState()
    // Social Media Manager produces attention; PII Leak blanks attention
    // producers. Browserbase also produces attention, so both are hit.
    expect(threatBlanksProducersOf(G, CARDS.cheap)).toBe(false)
    addThreat(G, CARDS.threatBlank)
    expect(threatBlanksProducersOf(G, CARDS.cheap)).toBe(true)
  })

  it('taxes a matching producer entering a context', () => {
    const G = emptyGameState()
    // Model Collapse taxes automation producers; Browserbase does not produce
    // automation, so it is untaxed, while a card that does is charged.
    addThreat(G, CARDS.threatFeed)
    expect(extraFeedFor(G, CARDS.cheap)).toBe(0)
    expect(extraFeedFor(G, CARDS.event)).toBe(1) // YC produces automation
  })
})

describe('Initialize targeting is determined, not chosen', () => {
  it('picks the highest producer of the named pip', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)   // no automation
    placeInContext(G, CARDS.event)   // YC produces one automation
    expect(highestProducerOf(G, 'technology')).toEqual({ chainIx: 0, slotIx: 1 })
  })

  it('finds nothing when no card produces that pip', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    expect(highestProducerOf(G, 'technology')).toBeNull()
  })
})
