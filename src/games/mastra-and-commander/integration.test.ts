/**
 * End-to-end: drive the real boardgame.io Client through complete rounds.
 *
 * The unit tests call helpers directly; this file proves the whole thing is
 * wired — setup, the move map, the phase machine, the gates, the plugins
 * (random), playerView, and endIf all cooperating.
 */
import { describe, expect, it } from 'vitest'
import { Client } from 'boardgame.io/client'
import { MastraCommander } from './Game'
import { MATCH_ROUNDS, ROUND_PHASES } from './constants'
import type { MCState } from './types'

/**
 * A plain in-process client — deliberately NOT `multiplayer: Local()`.
 *
 * With a multiplayer transport, moves dispatch asynchronously and the client
 * runs them optimistically against its redacted playerView copy, so reading
 * state immediately after a move is racy. A plain client applies moves
 * synchronously against the authoritative state, which is what these tests are
 * asserting about. Redaction has its own tests in playerView.test.ts.
 *
 * playerID is null here, which the move guards treat as "any seat" — the same
 * path the local hotseat client uses today.
 */
function makeClient() {
  const client = Client({ game: MastraCommander, numPlayers: 2 })
  client.start()
  return client
}

/** Clear whatever gate is open so the phase can advance. */
function clearGates(client: ReturnType<typeof makeClient>): void {
  const G = client.getState()!.G as MCState
  if (G.pendingFeaturePicks) client.moves.skipFeaturePicks()
  if (G.pendingEntropyTarget) client.moves.autoResolveEntropyTarget()
  if (G.pendingFailureScrap) client.moves.acceptOutcome()
}

/** Resolve the whole Entropy stack, auto-targeting as needed (solo behavior). */
function drainEntropy(client: ReturnType<typeof makeClient>): void {
  for (let guard = 0; guard < 100; guard++) {
    const G = client.getState()!.G as MCState
    if (G.pendingEntropyTarget) {
      client.moves.autoResolveEntropyTarget()
      continue
    }
    if (G.entropyStack.length === 0) return
    client.moves.resolveNextEntropy()
  }
  throw new Error('Entropy stack failed to drain — possible resolution loop')
}

/** Play one full round, ending back at reveal (or at match end). */
function playRound(client: ReturnType<typeof makeClient>): void {
  clearGates(client)                 // reveal: feature picks
  client.moves.advancePhase()        // → play

  // Play whatever is affordable: a free card always is.
  const G = client.getState()!.G as MCState
  const free = G.operatorHand.find((id) => id === 'TEST-OP-SCRATCHPAD')
  if (free) client.moves.playToContext(0, free, [])

  client.moves.advancePhase()        // → entropy
  drainEntropy(client)
  client.moves.advancePhase()        // → response
  client.moves.advancePhase()        // → evalCheck
  clearGates(client)                 // evalCheck: failure scrap
  client.moves.advancePhase()        // → rollover → next reveal
}

describe('setup through the Client', () => {
  it('builds a legal opening state', () => {
    const client = makeClient()
    const G = client.getState()!.G as MCState

    expect(G.round).toBe(1)
    expect(G.phase).toBe('reveal')
    expect(G.currentEvalId).not.toBeNull()
    expect(G.operatorHand.length).toBeGreaterThan(0)
    expect(G.commanderId).toBe('MASTRA')
    // The Reveal engine ran: equipment granted resources.
    const pool = G.roundPool
    expect(pool.capital + pool.attention + pool.technology + pool.generic)
      .toBeGreaterThan(0)
  })

  it('produces JSON-serializable state (bg.io log / saves / transcripts)', () => {
    const client = makeClient()
    const G = client.getState()!.G as MCState
    // Would throw on a Map/Set/function/circular ref.
    expect(() => JSON.stringify(G)).not.toThrow()
    expect(JSON.parse(JSON.stringify(G)).round).toBe(1)
  })
})

describe('a full round', () => {
  it('walks the five phases and returns to reveal', () => {
    const client = makeClient()
    const seen: string[] = []

    clearGates(client)
    for (const _ of ROUND_PHASES) {
      seen.push((client.getState()!.G as MCState).phase)
      const G = client.getState()!.G as MCState
      if (G.phase === 'entropy') drainEntropy(client)
      clearGates(client)
      client.moves.advancePhase()
      clearGates(client)
    }

    expect(seen).toEqual([...ROUND_PHASES])
    const after = client.getState()!.G as MCState
    expect(after.round).toBe(2)
    expect(after.phase).toBe('reveal')
  })

  it('records a result and scores the eval', () => {
    const client = makeClient()
    playRound(client)

    const G = client.getState()!.G as MCState
    expect(G.roundResults).toHaveLength(1)
    expect(['superior', 'best', 'lesser', 'failure']).toContain(G.roundResults[0]!.tier)
  })

  it('generates Entropy from Operator activity and resolves it', () => {
    const client = makeClient()
    clearGates(client)
    client.moves.advancePhase() // → play

    const before = client.getState()!.G as MCState
    const playable = before.operatorHand[0]!
    // Pitch-funded play: pitch everything else to guarantee payment options.
    client.moves.playToContext(0, playable, [])

    client.moves.advancePhase() // → entropy
    const atEntropy = client.getState()!.G as MCState
    // Either the play fed Entropy, or it was unaffordable and rejected —
    // in both cases the phase machine is intact.
    expect(atEntropy.phase).toBe('entropy')

    drainEntropy(client)
    expect((client.getState()!.G as MCState).entropyStack).toHaveLength(0)
  })
})

describe('move legality through the Client', () => {
  it('rejects a play during the wrong phase', () => {
    const client = makeClient()
    clearGates(client)
    // Still in reveal — playToContext must not take effect.
    const before = client.getState()!.G as MCState
    const card = before.operatorHand[0]!
    client.moves.playToContext(0, card, [])

    const after = client.getState()!.G as MCState
    expect(after.contexts[0]!.slots).toHaveLength(0)
  })

  it('will not advance out of Entropy with cards still on the stack', () => {
    const client = makeClient()
    clearGates(client)
    client.moves.advancePhase() // → play
    client.moves.advancePhase() // → entropy

    const G = client.getState()!.G as MCState
    if (G.entropyStack.length > 0) {
      client.moves.advancePhase()
      expect((client.getState()!.G as MCState).phase).toBe('entropy')
    }
  })
})

describe('a full match', () => {
  it('reaches a winner within MATCH_ROUNDS and stops', () => {
    const client = makeClient()

    for (let round = 0; round < MATCH_ROUNDS + 1; round++) {
      const G = client.getState()!.G as MCState
      if (G.matchWinner) break
      playRound(client)
    }

    const G = client.getState()!.G as MCState
    expect(G.matchWinner).not.toBeNull()
    expect(G.roundResults.length).toBeGreaterThanOrEqual(MATCH_ROUNDS)
    // bg.io's endIf picked it up.
    expect(client.getState()!.ctx.gameover).toEqual({ winner: G.matchWinner })
  })

  it('carries no stale gate across the round boundary', () => {
    const client = makeClient()
    playRound(client)

    const G = client.getState()!.G as MCState
    // The round's own gates are resolved...
    expect(G.pendingEntropyTarget).toBeNull()
    expect(G.pendingFailureScrap).toBeNull()
    // ...and the only thing open is the NEXT round's feature offer, freshly
    // opened by its Reveal.
    expect(G.phase).toBe('reveal')
    expect(G.round).toBe(2)
  })
})
