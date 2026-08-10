/**
 * The Entropy economy (design §4) and the three wrench vectors (design §5).
 */
import { describe, expect, it } from 'vitest'
import { applyEntropyEffect, eligibleTargets, isTargeted } from './entropyHelpers'
import { feedEntropy } from './playHelpers'
import { resolveNextEntropy, autoResolveEntropyTarget } from './entropyMoves'
import { emptyGameState, placeInContext, seededRandom } from '../testing/fixtures'
import type { MCState } from '../types'

/** Deterministic index picker for effects that need randomness. */
const firstIndex = () => 0

/** Minimal move context for calling move handlers directly. */
const mv = (G: MCState) => ({ G, playerID: '1', random: seededRandom() })

describe('feedEntropy', () => {
  it('moves cards from the Entropy deck onto the LIFO stack', () => {
    const G = emptyGameState()
    G.entropyDeck = ['A', 'B', 'C']
    feedEntropy(G, 2, 'test')
    expect(G.entropyStack).toEqual(['A', 'B'])
    expect(G.entropyDeck).toEqual(['C'])
    expect(G.entropyFedThisRound).toBe(2)
  })

  it('stops at an empty deck rather than throwing', () => {
    const G = emptyGameState()
    G.entropyDeck = ['A']
    const fed = feedEntropy(G, 3, 'test')
    expect(fed).toBe(1)
    expect(G.entropyStack).toEqual(['A'])
  })

  it('is absorbed once by the Tracing feature', () => {
    const G = emptyGameState()
    G.entropyDeck = ['A', 'B']
    G.ignoreNextFeed = true

    expect(feedEntropy(G, 1, 'first')).toBe(0)
    expect(G.entropyStack).toEqual([])
    expect(G.ignoreNextFeed).toBe(false)

    // The next feed lands normally.
    expect(feedEntropy(G, 1, 'second')).toBe(1)
    expect(G.entropyStack).toEqual(['A'])
  })
})

describe('LIFO resolution order', () => {
  it('resolves the most recently fed card first', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    // Both are no-op cards, so resolution is pure ordering.
    G.entropyStack = ['TEST-EN-STATIC', 'TEST-EN-HALLUCINATION']

    resolveNextEntropy(mv(G))
    // Hallucination was on top (end of array) — it resolved first.
    expect(G.entropyResolved).toEqual(['TEST-EN-HALLUCINATION'])
    expect(G.entropyStack).toEqual(['TEST-EN-STATIC'])
  })

  it('draws the Operator one card per Entropy resolved', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = ['TEST-EN-STATIC']
    G.operatorDeck = ['TEST-OP-AGENT']

    resolveNextEntropy(mv(G))
    expect(G.operatorHand).toEqual(['TEST-OP-AGENT'])
  })

  it('resolves cards fed mid-resolution later in the same phase', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyDeck = ['TEST-EN-STATIC']
    G.entropyStack = ['TEST-EN-CASCADE'] // feedExtra 1

    resolveNextEntropy(mv(G))
    // The cascade fed a new card onto the stack, still to resolve.
    expect(G.entropyStack).toEqual(['TEST-EN-STATIC'])
  })
})

describe('wrench vector — Pollution', () => {
  it('injects junk contributions that will be scored', () => {
    const G = emptyGameState()
    applyEntropyEffect(G, { kind: 'pollute', junk: [{ color: 'pink', shape: 'hexagon' }] }, null, firstIndex)
    expect(G.injectedContributions).toHaveLength(1)
  })
})

describe('wrench vector — Subversion', () => {
  it('blanks the targeted Context slot', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    const targets = eligibleTargets(G, { kind: 'subvert' })
    expect(targets).toHaveLength(1)

    applyEntropyEffect(G, { kind: 'subvert' }, targets[0]!, firstIndex)
    expect(G.contexts[0]!.slots[0]!.subverted).toBe(true)
  })

  it('does not offer an already-subverted slot as a target', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    G.contexts[0]!.slots[0]!.subverted = true
    expect(eligibleTargets(G, { kind: 'subvert' })).toHaveLength(0)
  })

  it('ecosystemTax hits a whole vendor group at once', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-TOOL-WEBSEARCH')  // oss
    placeInContext(G, 'TEST-OP-MCP-FILESYSTEM')  // oss
    placeInContext(G, 'TEST-OP-AGENT')           // anthropic

    applyEntropyEffect(G, { kind: 'ecosystemTax', ecosystem: 'oss' }, null, firstIndex)
    expect(G.contexts[0]!.slots[0]!.subverted).toBe(true)
    expect(G.contexts[0]!.slots[1]!.subverted).toBe(true)
    expect(G.contexts[0]!.slots[2]!.subverted).toBe(false)
  })
})

describe('wrench vector — Goal-hijack', () => {
  it('swaps the current objective for the next eval card', () => {
    const G = emptyGameState()
    G.currentEvalId = 'TEST-EV-TRIPLE-CYAN'
    G.evalDeck = ['TEST-EV-NO-PINK']

    applyEntropyEffect(G, { kind: 'hijack' }, null, firstIndex)
    expect(G.currentEvalId).toBe('TEST-EV-NO-PINK')
    // The old objective goes to the bottom of the deck.
    expect(G.evalDeck).toEqual(['TEST-EV-TRIPLE-CYAN'])
  })

  it('fizzles when no objectives remain', () => {
    const G = emptyGameState()
    G.currentEvalId = 'TEST-EV-TRIPLE-CYAN'
    G.evalDeck = []

    applyEntropyEffect(G, { kind: 'hijack' }, null, firstIndex)
    expect(G.currentEvalId).toBe('TEST-EV-TRIPLE-CYAN')
  })
})

describe('server attacks', () => {
  it('destroys the server and discards both its cards', () => {
    const G = emptyGameState()
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-TOOL-WEBSEARCH',
      disabled: false,
    }]
    const targets = eligibleTargets(G, { kind: 'attackServer' })
    applyEntropyEffect(G, { kind: 'attackServer' }, targets[0]!, firstIndex)

    expect(G.servers).toHaveLength(0)
    expect(G.operatorDiscard).toContain('TEST-OP-SCRATCHPAD')
    expect(G.operatorDiscard).toContain('TEST-OP-TOOL-WEBSEARCH')
  })
})

describe('targeting gate', () => {
  it('opens the gate for a targeted effect with legal targets', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    placeInContext(G, 'TEST-OP-AGENT')
    G.entropyStack = ['TEST-EN-PROMPT-INJECTION']

    resolveNextEntropy(mv(G))
    expect(G.pendingEntropyTarget).not.toBeNull()
    // The card is not yet resolved — the gate holds it.
    expect(G.entropyResolved).toHaveLength(0)
  })

  it('fizzles instead of gating when nothing is targetable', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = ['TEST-EN-PROMPT-INJECTION']

    resolveNextEntropy(mv(G))
    expect(G.pendingEntropyTarget).toBeNull()
    expect(G.entropyResolved).toEqual(['TEST-EN-PROMPT-INJECTION'])
  })

  it('auto-resolves to the leftmost eligible target (solo rule)', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    placeInContext(G, 'TEST-OP-AGENT')
    placeInContext(G, 'TEST-OP-SUBAGENT')
    G.entropyStack = ['TEST-EN-PROMPT-INJECTION']

    resolveNextEntropy(mv(G))
    autoResolveEntropyTarget(mv(G))

    // Leftmost = slot 0.
    expect(G.contexts[0]!.slots[0]!.subverted).toBe(true)
    expect(G.contexts[0]!.slots[1]!.subverted).toBe(false)
    expect(G.pendingEntropyTarget).toBeNull()
    expect(G.entropyResolved).toEqual(['TEST-EN-PROMPT-INJECTION'])
  })
})

describe('isTargeted', () => {
  it('classifies effects that need a choice', () => {
    expect(isTargeted({ kind: 'subvert' })).toBe(true)
    expect(isTargeted({ kind: 'attackServer' })).toBe(true)
    expect(isTargeted({ kind: 'pollute', junk: [] })).toBe(false)
    expect(isTargeted({ kind: 'hijack' })).toBe(false)
  })
})

describe('hand disruption', () => {
  it('discards a card from hand at random', () => {
    const G = emptyGameState()
    G.operatorHand = ['TEST-OP-AGENT']
    applyEntropyEffect(G, { kind: 'discardRandomFromHand' }, null, firstIndex)
    expect(G.operatorHand).toHaveLength(0)
    expect(G.operatorDiscard).toEqual(['TEST-OP-AGENT'])
  })

  it('is a no-op on an empty hand', () => {
    const G = emptyGameState()
    applyEntropyEffect(G, { kind: 'discardRandomFromHand' }, null, firstIndex)
    expect(G.operatorDiscard).toHaveLength(0)
  })
})
