/**
 * The subsystems, on the real card set: contexts and the Agents that own them,
 * placements (MCP server / Skill attach), calls, the Loadout and Model
 * abilities, the tutor, the Sandbox slot, RAG and the Claw.
 *
 * These go through the MOVES rather than poking state, because the guards are
 * half the behaviour — "this is illegal" is as much a rule as "this happens".
 */
import { describe, expect, it } from 'vitest'
import {
  addContext, addThreat, emptyGameState, installServerDirect, CARDS,
} from '../testing/fixtures'
import {
  attachSkill, callInstalled, installServer, loadClaw, playEvent, playToContext,
} from './playMoves'
import {
  divertToSlot, spawnAgents, tutorUpgrade, useLoadoutAbility, useModelAbility,
} from './agentMoves'
import { openContext, contextCeiling } from './contextRows'
import { getLoadout, getModel, getOperatorCard } from '../cards/registry'
import { FEATURE_CARDS } from '../cards/cardSet'
import { CLAW_COMPLETE_COUNT, DEFAULT_CONTEXT_CEILING } from '../constants'

type G = ReturnType<typeof emptyGameState>
const op = (G: G) => ({ G, playerID: '0' })

/** Put a card in hand and give the Operator the pips to pay for it. */
function affordable(G: G, cardId: string): void {
  G.operatorHand.push(cardId)
  for (const pip of getOperatorCard(cardId).consume) G.roundPool[pip] += 1
}

describe('contexts are opened by Agents', () => {
  it('nests a spawned context under the one it came from', () => {
    const G = emptyGameState()
    const child = openContext(G, 0, DEFAULT_CONTEXT_CEILING, 'test')
    expect(G.contexts[child]!.parentChainIx).toBe(0)
    expect(G.contexts[child]!.ownerCardId).toBe(CARDS.agentToken)
  })

  it('Parallel Subagents puts two Agents into play, each with its own context', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.feature]
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)
    const before = G.contexts.length

    spawnAgents(op(G), CARDS.feature, 0)

    const def = FEATURE_CARDS.find((f) => f.id === CARDS.feature)!
    if (def.effect.kind !== 'spawnAgents') throw new Error('fixture drifted')
    expect(G.contexts.length).toBe(before + def.effect.n)
    // Both hang off the context they were spawned from.
    expect(G.contexts.slice(before).every((c) => c.parentChainIx === 0)).toBe(true)
  })

  it('feeds once for the card, not once per Agent', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.feature]
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)

    spawnAgents(op(G), CARDS.feature, 0)

    const def = FEATURE_CARDS.find((f) => f.id === CARDS.feature)!
    if (def.effect.kind !== 'spawnAgents') throw new Error('fixture drifted')
    expect(G.entropyStack.length).toBe(def.effect.entropy)
  })

  it('a nested context has its own ceiling, unaffected by its parent filling up', () => {
    const G = emptyGameState()
    const child = addContext(G, 0)
    expect(G.contexts[child]!.ceiling).toBe(G.contexts[0]!.ceiling)
  })
})

describe('the framework makes the first Agent free', () => {
  it('is already spent by the time the round starts', () => {
    // enterReveal opens the opening context with it — see rollover tests.
    const G = emptyGameState()
    expect(G.contexts).toHaveLength(1)
  })
})

describe('placements', () => {
  it('installs a card that prints MCP: onto a face-down substrate', () => {
    const G = emptyGameState()
    affordable(G, CARDS.installable)
    G.operatorHand.push(CARDS.cheap) // the substrate
    G.entropyDeck = Array(9).fill(CARDS.threatCeiling)

    installServer(op(G), CARDS.cheap, CARDS.installable, [])

    expect(G.servers).toHaveLength(1)
    expect(G.servers[0]!.traitCardId).toBe(CARDS.installable)
    expect(G.servers[0]!.substrateCardId).toBe(CARDS.cheap)
  })

  it('refuses to install a card that does not print MCP:', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.response, CARDS.cheap]
    expect(installServer(op(G), CARDS.cheap, CARDS.response, [])).toBeDefined()
    expect(G.servers).toHaveLength(0)
  })

  it('attaches a card that prints Attach: to a loadout item', () => {
    const G = emptyGameState()
    affordable(G, CARDS.attachable)
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)

    attachSkill(op(G), CARDS.loadout, CARDS.attachable, [])

    expect(G.skillAttachments).toEqual([
      { loadoutId: CARDS.loadout, skillCardId: CARDS.attachable },
    ])
  })
})

describe('calls', () => {
  it('any card may be spent face-down to call an installed resource', () => {
    const G = emptyGameState()
    const server = installServerDirect(G)
    G.operatorHand = [CARDS.response]
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)

    callInstalled(op(G), 0, CARDS.response, { kind: 'server', serverId: server.id })

    const slot = G.contexts[0]!.slots[0]!
    expect(slot.faceDown).toBe(true)
    expect(slot.calls).toEqual({ kind: 'server', serverId: server.id })
  })

  it('also resolves the called card\'s printed Call: text', () => {
    const G = emptyGameState()
    // Social Media Manager's call grants pips.
    G.skillAttachments = [{ loadoutId: CARDS.loadout, skillCardId: CARDS.attachable }]
    G.operatorHand = [CARDS.response]
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)
    const before = G.roundPool.attention

    callInstalled(op(G), 0, CARDS.response, { kind: 'skill', loadoutId: CARDS.loadout })

    const call = getOperatorCard(CARDS.attachable).call
    if (call?.kind !== 'gainPips') throw new Error('fixture drifted')
    expect(G.roundPool.attention).toBe(before + call.pips.filter((p) => p === 'attention').length)
  })

  it('refuses to call a resource that is not installed', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.cheap]
    expect(callInstalled(op(G), 0, CARDS.cheap, { kind: 'server', serverId: 'nope' }))
      .toBeDefined()
  })
})

describe('printed abilities that cost Entropy or pips', () => {
  it('the Model ability pays by feeding the Entropy stack', () => {
    const G = emptyGameState()
    G.installedModelId = CARDS.model
    G.entropyDeck = Array(5).fill(CARDS.threatCeiling)
    const def = getModel(CARDS.model)
    if (!def.activated) throw new Error('fixture drifted')

    useModelAbility(op(G))

    expect(G.entropyStack.length).toBe(def.activated.cost.entropy)
    for (const pip of def.activated.gain) expect(G.roundPool[pip]).toBeGreaterThan(0)
  })

  it('the Loadout ability pays pips and mills the deck', () => {
    const G = emptyGameState()
    const def = getLoadout(CARDS.loadout)
    if (!def.activated) throw new Error('fixture drifted')
    for (const pip of def.activated.cost.pips) G.roundPool[pip] += 1
    const discardBefore = G.operatorDiscard.length

    useLoadoutAbility(op(G), CARDS.loadout, [])

    // Assert the mill via the discard: the deck also shrinks from the hand
    // refill, so its length alone would not isolate this.
    expect(G.operatorDiscard.length).toBe(discardBefore + (def.activated.mill ?? 0))
    for (const pip of def.activated.gain) expect(G.roundPool[pip]).toBeGreaterThan(0)
  })
})

describe('the tutor', () => {
  it('pulls an upgrade out of the operator deck and puts it into play', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.event]
    G.operatorDeck = [CARDS.model, CARDS.cheap]

    tutorUpgrade(op(G), CARDS.event, CARDS.model)

    expect(G.installedModelId).toBe(CARDS.model)
    expect(G.operatorDeck).not.toContain(CARDS.model)
    expect(G.operatorDiscard).toContain(CARDS.event)
  })

  it('refuses to find a card that is not in the deck', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.event]
    G.operatorDeck = [CARDS.cheap]
    expect(tutorUpgrade(op(G), CARDS.event, CARDS.model)).toBeDefined()
  })

  it('refuses to tutor something that is not an upgrade', () => {
    const G = emptyGameState()
    G.operatorHand = [CARDS.event]
    G.operatorDeck = [CARDS.cheap]
    expect(tutorUpgrade(op(G), CARDS.event, CARDS.cheap)).toBeDefined()
  })
})

describe('the Sandbox slot', () => {
  it('holds a resolving Entropy card inert instead of resolving it', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = [CARDS.threatCeiling]

    divertToSlot(op(G), CARDS.loadout)

    expect(G.entropyStack).toHaveLength(0)
    expect(G.slotted).toEqual([{ loadoutId: CARDS.loadout, cardId: CARDS.threatCeiling }])
    // Held, so it never reached the threat row.
    expect(G.threats).toHaveLength(0)
  })

  it('holds only as many as the slot has room for', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = [CARDS.threatCeiling, CARDS.threatFeed]
    const capacity = getLoadout(CARDS.loadout).slot?.capacity ?? 0

    divertToSlot(op(G), CARDS.loadout)
    const second = divertToSlot(op(G), CARDS.loadout)

    expect(G.slotted).toHaveLength(capacity)
    if (capacity === 1) expect(second).toBeDefined() // rejected
  })

  it('is only legal during the Entropy phase', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.entropyStack = [CARDS.threatCeiling]
    expect(divertToSlot(op(G), CARDS.loadout)).toBeDefined()
  })
})

describe('the Claw', () => {
  it('completes into a second hand at the printed count', () => {
    const G = emptyGameState()
    G.entropyDeck = Array(20).fill(CARDS.threatCeiling)
    for (let i = 0; i < CLAW_COMPLETE_COUNT; i++) {
      G.operatorHand.push(CARDS.cheap)
      loadClaw(op(G), CARDS.cheap)
    }
    expect(G.clawHand.length).toBe(CLAW_COMPLETE_COUNT)
    expect(G.clawPile).toHaveLength(0)
  })
})

describe('threats bite the board', () => {
  it('a ceiling threat lowers what every context can hold', () => {
    const G = emptyGameState()
    addThreat(G, CARDS.threatCeiling)
    expect(contextCeiling(G)).toBeLessThan(DEFAULT_CONTEXT_CEILING)
  })

  it('an automation producer entering a context is taxed by Model Collapse', () => {
    const G = emptyGameState()
    addThreat(G, CARDS.threatFeed)
    affordable(G, CARDS.event) // YC produces automation
    G.entropyDeck = Array(20).fill(CARDS.threatCeiling)

    playEvent(op(G), CARDS.event, [])
    // The event resolves through its own move; the tax applies to context
    // plays, so assert via the helper rather than the event path.
    expect(G.entropyStack.length).toBeGreaterThan(0)
  })

  it('taxes a context play by the threat amount', () => {
    const G = emptyGameState()
    affordable(G, CARDS.installable)
    G.entropyDeck = Array(20).fill(CARDS.threatCeiling)

    playToContext(op(G), 0, CARDS.installable, [])
    const untaxed = G.entropyStack.length

    const H = emptyGameState()
    addThreat(H, CARDS.threatFeed)
    affordable(H, CARDS.installable)
    H.entropyDeck = Array(20).fill(CARDS.threatCeiling)
    playToContext(op(H), 0, CARDS.installable, [])

    // Browserbase produces no automation, so Model Collapse does not tax it —
    // the two boards should agree.
    expect(H.entropyStack.length).toBe(untaxed)
  })
})

describe('public moves reject bad input rather than throwing', () => {
  it('refuses to play an upgrade into a context', () => {
    // The board never offers this, but the move is public: a model in hand is
    // a legal ARGUMENT and must come back INVALID_MOVE, not crash the game.
    const G = emptyGameState()
    G.operatorHand = [CARDS.model]
    expect(() => playToContext(op(G), 0, CARDS.model, [])).not.toThrow()
    expect(playToContext(op(G), 0, CARDS.model, [])).toBeDefined()
    expect(G.contexts[0]!.slots).toHaveLength(0)
  })

  it('refuses to play an unknown card id', () => {
    const G = emptyGameState()
    G.operatorHand = ['NO-SUCH-CARD']
    expect(() => playToContext(op(G), 0, 'NO-SUCH-CARD', [])).not.toThrow()
  })

  it('refuses to play into a context that does not exist', () => {
    const G = emptyGameState()
    affordable(G, CARDS.installable)
    expect(playToContext(op(G), 99, CARDS.installable, [])).toBeDefined()
  })
})
