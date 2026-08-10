/**
 * Per-seat redaction of hidden information (design §4: uniform card backs make
 * face-down play work).
 */
import { describe, expect, it } from 'vitest'
import { HIDDEN, playerView } from './playerView'
import { ENTROPY_SEAT, OPERATOR_SEAT } from './constants'
import { emptyGameState } from './testing/fixtures'

describe('playerView — Operator seat', () => {
  it('hides the Entropy deck and stack contents', () => {
    const G = emptyGameState()
    G.entropyDeck = ['TEST-EN-STATIC']
    G.entropyStack = ['TEST-EN-HALLUCINATION']

    const view = playerView(G, OPERATOR_SEAT)
    expect(view.entropyDeck).toEqual([HIDDEN])
    expect(view.entropyStack).toEqual([HIDDEN])
  })

  it('keeps its own hand visible', () => {
    const G = emptyGameState()
    G.operatorHand = ['TEST-OP-AGENT']
    expect(playerView(G, OPERATOR_SEAT).operatorHand).toEqual(['TEST-OP-AGENT'])
  })

  it('keeps resolved Entropy visible — it has already happened', () => {
    const G = emptyGameState()
    G.entropyResolved = ['TEST-EN-STATIC']
    expect(playerView(G, OPERATOR_SEAT).entropyResolved).toEqual(['TEST-EN-STATIC'])
  })
})

describe('playerView — Entropy seat', () => {
  it("hides the Operator's hand and the face-down Claw", () => {
    const G = emptyGameState()
    G.operatorHand = ['TEST-OP-AGENT', 'TEST-OP-SUBAGENT']
    G.clawPile = ['TEST-OP-SCRATCHPAD']

    const view = playerView(G, ENTROPY_SEAT)
    expect(view.operatorHand).toEqual([HIDDEN, HIDDEN])
    expect(view.clawPile).toEqual([HIDDEN])
  })

  it('hides the face-down server substrate but shows the capability', () => {
    const G = emptyGameState()
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-MCP-FILESYSTEM',
      disabled: false,
    }]

    const view = playerView(G, ENTROPY_SEAT)
    expect(view.servers[0]!.substrateCardId).toBe(HIDDEN)
    // The installed capability is public — it is what Entropy is attacking.
    expect(view.servers[0]!.traitCardId).toBe('TEST-OP-MCP-FILESYSTEM')
  })

  it('keeps the Context public — it is the shared board', () => {
    const G = emptyGameState()
    G.contexts[0]!.slots.push({
      cardId: 'TEST-OP-AGENT',
      faceDown: false,
      calls: null,
      outputsRemaining: { capital: 0, attention: 0, technology: 0, generic: 0 },
      relayed: false,
      subverted: false,
    })
    expect(playerView(G, ENTROPY_SEAT).contexts[0]!.slots[0]!.cardId).toBe('TEST-OP-AGENT')
  })
})

describe('playerView — invariants', () => {
  it('preserves counts so both seats can reason about size', () => {
    const G = emptyGameState()
    G.operatorHand = ['A', 'B', 'C'].map(() => 'TEST-OP-AGENT')
    expect(playerView(G, ENTROPY_SEAT).operatorHand).toHaveLength(3)
  })

  it('never mutates the source state', () => {
    const G = emptyGameState()
    G.operatorHand = ['TEST-OP-AGENT']
    playerView(G, ENTROPY_SEAT)
    expect(G.operatorHand).toEqual(['TEST-OP-AGENT'])
  })

  it('does not redact for a null (spectator/local) player', () => {
    const G = emptyGameState()
    G.operatorHand = ['TEST-OP-AGENT']
    // KNOWN GAP: this is why local hotseat does not yet physically hide
    // information — see playerView.ts's header.
    expect(playerView(G, null).operatorHand).toEqual(['TEST-OP-AGENT'])
  })

  it('hides the objective order from both seats', () => {
    const G = emptyGameState()
    G.evalDeck = ['TEST-EV-NO-PINK']
    expect(playerView(G, OPERATOR_SEAT).evalDeck).toEqual([HIDDEN])
    expect(playerView(G, ENTROPY_SEAT).evalDeck).toEqual([HIDDEN])
  })
})
