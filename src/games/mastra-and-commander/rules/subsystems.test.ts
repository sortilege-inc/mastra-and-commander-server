/**
 * The subsystems: play moves, RAG, Claw, servers, models, Processes,
 * ecosystem discounts, features, and responses.
 *
 * Most of these implement BEST-GUESS rules (the design doc leaves them 🟨/❓),
 * so these tests are as much a record of WHAT WE GUESSED as a regression net.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAW_COMPLETE_COUNT, HAND_SIZE, RAG_CHAPTERS, RAG_RERANK_INDEX,
  RAG_UPSERT_INDEX,
} from '../constants'
import {
  advanceRag, attachSkill, callInstalled, closeProcess, installServer, loadClaw,
  openProcess, playEvent, playToContext, upgradeModel,
} from './playMoves'
import { playResponse } from './responseMoves'
import { pickFeature, skipFeaturePicks } from './revealMoves'
import { advancePhase } from './phaseMoves'
import { ecosystemDiscount } from './playHelpers'
import { emptyGameState, placeInContext, seededRandom } from '../testing/fixtures'
import { getOperatorCard } from '../cards/registry'
import type { MCState } from '../types'

const mv = (G: MCState) => ({ G, playerID: '0', random: seededRandom() })

describe('playToContext', () => {
  it('plays a free card and records its outputs', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD']

    playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])
    expect(G.contexts[0]!.slots).toHaveLength(1)
    expect(G.contexts[0]!.slots[0]!.outputsRemaining.generic).toBe(1)
    // The hand refilled to HAND_SIZE rather than shrinking.
    expect(G.operatorHand).toHaveLength(HAND_SIZE)
  })

  it('chains: the previous card outputs pay the next cost', () => {
    const G = emptyGameState()
    G.phase = 'play'
    // Scratchpad produces a generic; Workflow-A costs a generic.
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-WORKFLOW-A']

    playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])
    playToContext(mv(G), 0, 'TEST-OP-WORKFLOW-A', [])

    expect(G.contexts[0]!.slots).toHaveLength(2)
    // The scratchpad's output was consumed.
    expect(G.contexts[0]!.slots[0]!.outputsRemaining.generic).toBe(0)
  })

  it('rejects a play that cannot be paid', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT'] // costs technology, nothing available
    G.commanderFreeAgentUsed = true    // testing the paid path

    const result = playToContext(mv(G), 0, 'TEST-OP-AGENT', [])
    expect(result).toBeDefined() // INVALID_MOVE
    expect(G.contexts[0]!.slots).toHaveLength(0)
  })

  it('pitching pays the cost, draws a card, and feeds Entropy', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT', 'TEST-OP-SUBAGENT'] // subagent cost includes technology
    G.commanderFreeAgentUsed = true // testing the paid path
    G.operatorDeck = ['TEST-OP-SCRATCHPAD']
    G.entropyDeck = ['TEST-EN-STATIC', 'TEST-EN-HALLUCINATION', 'TEST-EN-SLOP']

    playToContext(mv(G), 0, 'TEST-OP-AGENT', ['TEST-OP-SUBAGENT'])

    expect(G.contexts[0]!.slots).toHaveLength(1)
    expect(G.operatorDiscard).toContain('TEST-OP-SUBAGENT')
    // The hand refilled from the deck.
    expect(G.operatorHand).toContain('TEST-OP-SCRATCHPAD')
    // Subagent (cyan triangle) vs Agent (cyan circle) = colour-only = 2,
    // plus 1 for playing the Agent itself.
    expect(G.entropyStack.length).toBe(3)
  })

  it('honors a card multi-feed', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SWARM']
    G.commanderFreeAgentUsed = true // Swarm is an Agent; test the paid path
    G.roundPool = { capital: 0, attention: 1, technology: 2, generic: 0 }
    G.entropyDeck = ['A', 'B', 'C', 'D'].map(() => 'TEST-EN-STATIC')

    playToContext(mv(G), 0, 'TEST-OP-SWARM', [])
    // Swarm feeds 3.
    expect(G.entropyStack).toHaveLength(3)
  })

  it('refuses to play into a closed Process', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.contexts[0]!.closed = true
    G.operatorHand = ['TEST-OP-SCRATCHPAD']

    expect(playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])).toBeDefined()
  })

  it('is blocked while a gate is open', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD']
    G.pendingFeaturePicks = { remaining: 1 }

    expect(playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])).toBeDefined()
  })
})

describe('events', () => {
  it('draws on Got Into YC', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-FUNDING']
    G.roundPool.generic = 1
    G.operatorDeck = ['TEST-OP-AGENT']

    playEvent(mv(G), 'TEST-OP-FUNDING', [])
    expect(G.operatorHand).toContain('TEST-OP-AGENT')
    expect(G.operatorDiscard).toContain('TEST-OP-FUNDING')
  })

  it('Parallelism raises the Process limit', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-PARALLELISM']
    G.roundPool = { capital: 0, attention: 1, technology: 0, generic: 1 }

    playEvent(mv(G), 'TEST-OP-PARALLELISM', [])
    expect(G.processLimit).toBe(2)

    openProcess(mv(G))
    expect(G.contexts).toHaveLength(2)
  })

  it('refuses to open a Process beyond the limit', () => {
    const G = emptyGameState()
    G.phase = 'play'
    expect(openProcess(mv(G))).toBeDefined()
  })

  it('closes a Process, which still scores', () => {
    const G = emptyGameState()
    G.phase = 'play'
    placeInContext(G, 'TEST-OP-AGENT')
    closeProcess(mv(G), 0)
    expect(G.contexts[0]!.closed).toBe(true)
  })
})

describe('commander — Mastra', () => {
  it('makes the first Agent each round free of cost and Entropy', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT'] // normally costs technology
    G.entropyDeck = ['TEST-EN-STATIC']

    playToContext(mv(G), 0, 'TEST-OP-AGENT', [])

    expect(G.contexts[0]!.slots).toHaveLength(1)
    // Nothing paid, nothing fed.
    expect(G.roundPool.technology).toBe(0)
    expect(G.entropyStack).toHaveLength(0)
    expect(G.commanderFreeAgentUsed).toBe(true)
  })

  it('charges the second Agent normally', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT', 'TEST-OP-AGENT']
    G.roundPool.technology = 1
    G.entropyDeck = ['TEST-EN-STATIC', 'TEST-EN-SLOP']

    playToContext(mv(G), 0, 'TEST-OP-AGENT', []) // free
    playToContext(mv(G), 0, 'TEST-OP-AGENT', []) // paid

    expect(G.contexts[0]!.slots).toHaveLength(2)
    expect(G.roundPool.technology).toBe(0)
    expect(G.entropyStack).toHaveLength(1)
  })

  it('does not apply to non-Agent cards', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-MCP-FILESYSTEM'] // costs technology, not an Agent

    const result = playToContext(mv(G), 0, 'TEST-OP-MCP-FILESYSTEM', [])
    expect(result).toBeDefined() // unpayable → INVALID_MOVE
    expect(G.commanderFreeAgentUsed).toBe(false)
  })
})

describe('RAG — the setup saga', () => {
  /** Pay a chapter from the round pool by granting exactly its cost. */
  const payChapter = (G: MCState, ix: number) => {
    const chapter = RAG_CHAPTERS[ix]!
    G.roundPool[chapter.cost] += 1
  }

  it('advances one chapter at a time, each wanting its own resource', () => {
    const G = emptyGameState()
    G.phase = 'play'

    // The wrong resource will not do.
    G.roundPool.capital = 5
    expect(advanceRag(mv(G))).toBeDefined() // Chunk wants technology

    payChapter(G, 0)
    advanceRag(mv(G))
    expect(G.rag.chaptersComplete).toBe(1)
  })

  it('takes its payload from the card fed to Upsert', () => {
    const G = emptyGameState()
    G.phase = 'play'
    for (let ix = 0; ix < RAG_UPSERT_INDEX; ix++) {
      payChapter(G, ix)
      advanceRag(mv(G))
    }
    expect(G.rag.chaptersComplete).toBe(RAG_UPSERT_INDEX)

    G.operatorHand = ['TEST-OP-AGENT'] // cyan circle
    payChapter(G, RAG_UPSERT_INDEX)
    advanceRag(mv(G), [], 'TEST-OP-AGENT')

    expect(G.rag.upsertCardId).toBe('TEST-OP-AGENT')
    expect(G.rag.contribution).toEqual([{ color: 'cyan', shape: 'circle' }])
  })

  it('clears Entropy at random once the required chapters are done', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.entropyStack = Array(6).fill('TEST-EN-STATIC')
    for (let ix = 0; ix < RAG_UPSERT_INDEX; ix++) {
      payChapter(G, ix)
      advanceRag(mv(G))
    }
    G.operatorHand = ['TEST-OP-AGENT']
    payChapter(G, RAG_UPSERT_INDEX)
    advanceRag(mv(G), [], 'TEST-OP-AGENT')

    expect(G.entropyStack).toHaveLength(3) // 6 − RAG_CLEAR_COUNT
  })

  it('Rerank swaps the payload only for one of equal size', () => {
    const G = emptyGameState()
    G.phase = 'play'
    for (let ix = 0; ix < RAG_UPSERT_INDEX; ix++) {
      payChapter(G, ix)
      advanceRag(mv(G))
    }
    G.operatorHand = ['TEST-OP-AGENT'] // 1 icon
    payChapter(G, RAG_UPSERT_INDEX)
    advanceRag(mv(G), [], 'TEST-OP-AGENT')

    // Supervisor carries 2 icons — the wrong size.
    G.operatorHand = ['TEST-OP-SUPERVISOR']
    payChapter(G, RAG_RERANK_INDEX)
    expect(advanceRag(mv(G), [], 'TEST-OP-SUPERVISOR')).toBeDefined()

    // Workflow-A carries 1 — an even trade.
    G.operatorHand = ['TEST-OP-WORKFLOW-A'] // amber circle
    advanceRag(mv(G), [], 'TEST-OP-WORKFLOW-A')
    expect(G.rag.contribution).toEqual([{ color: 'amber', shape: 'circle' }])
    expect(G.rag.rerankUsed).toBe(true)
  })

  it('is callable only once Upsert is done', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD']

    // Nothing to call yet.
    expect(callInstalled(mv(G), 0, 'TEST-OP-SCRATCHPAD', { kind: 'rag' })).toBeDefined()

    G.rag.chaptersComplete = RAG_UPSERT_INDEX + 1
    G.rag.contribution = [{ color: 'cyan', shape: 'circle' }]
    callInstalled(mv(G), 0, 'TEST-OP-SCRATCHPAD', { kind: 'rag' })
    expect(G.contexts[0]!.slots[0]!.faceDown).toBe(true)
  })
})

describe('Claw', () => {
  it('completes into a second hand at the threshold', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT', 'TEST-OP-SUBAGENT', 'TEST-OP-SCRATCHPAD']

    for (const id of [...G.operatorHand]) loadClaw(mv(G), id)

    expect(G.clawHand).toHaveLength(CLAW_COMPLETE_COUNT)
    expect(G.clawPile).toHaveLength(0)
  })

  it('cards in the claw hand are playable', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.clawHand = ['TEST-OP-SCRATCHPAD']

    playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])
    expect(G.contexts[0]!.slots).toHaveLength(1)
    expect(G.clawHand).toHaveLength(0)
  })
})

describe('Tool and Skill placement', () => {
  it('installs a Tool as an MCP server over a face-down substrate', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-MCP-FILESYSTEM']
    G.roundPool.technology = 1
    G.entropyDeck = Array(4).fill('TEST-EN-STATIC')

    installServer(mv(G), 'TEST-OP-SCRATCHPAD', 'TEST-OP-MCP-FILESYSTEM', [])

    expect(G.servers).toHaveLength(1)
    expect(G.servers[0]!.substrateCardId).toBe('TEST-OP-SCRATCHPAD')
    // Two Entropy — one per card.
    expect(G.entropyStack).toHaveLength(2)
  })

  it('plays a Tool inline for 1 Entropy instead, gaining no Durable', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-MCP-FILESYSTEM']
    G.roundPool.technology = 1
    G.entropyDeck = Array(4).fill('TEST-EN-STATIC')

    playToContext(mv(G), 0, 'TEST-OP-MCP-FILESYSTEM', [])

    expect(G.contexts[0]!.slots).toHaveLength(1)
    expect(G.servers).toHaveLength(0)
    expect(G.entropyStack).toHaveLength(1)
  })

  it('attaches a Skill to a loadout item', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SKILL-SUMMARIZE']
    G.roundPool.generic = 1

    attachSkill(mv(G), 'TEST-EQ-LOCAL-RIG', 'TEST-OP-SKILL-SUMMARIZE', [])
    expect(G.skillAttachments).toEqual([{
      equipmentId: 'TEST-EQ-LOCAL-RIG',
      skillCardId: 'TEST-OP-SKILL-SUMMARIZE',
    }])
  })

  it('allows only one Skill per loadout item', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.skillAttachments = [{
      equipmentId: 'TEST-EQ-LOCAL-RIG',
      skillCardId: 'TEST-OP-SKILL-SUMMARIZE',
    }]
    G.operatorHand = ['TEST-OP-SKILL-SUMMARIZE']
    G.roundPool.generic = 1

    expect(attachSkill(mv(G), 'TEST-EQ-LOCAL-RIG', 'TEST-OP-SKILL-SUMMARIZE', []))
      .toBeDefined()
  })

  it('refuses to install a non-Tool', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-AGENT']
    G.roundPool.technology = 1

    expect(installServer(mv(G), 'TEST-OP-SCRATCHPAD', 'TEST-OP-AGENT', []))
      .toBeDefined()
  })

  it('calls an installed resource face-down for free', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-MCP-FILESYSTEM',
      disabled: false,
    }]
    G.operatorHand = ['TEST-OP-AGENT']
    G.entropyDeck = Array(3).fill('TEST-EN-STATIC')

    callInstalled(mv(G), 0, 'TEST-OP-AGENT', { kind: 'server', index: 0 })

    const slot = G.contexts[0]!.slots[0]!
    expect(slot.faceDown).toBe(true)
    expect(slot.calls).toEqual({ kind: 'server', index: 0 })
    // Free: the Entropy was paid at install time.
    expect(G.entropyStack).toHaveLength(0)
  })

  it('refuses to call something that is not installed', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT']
    expect(callInstalled(mv(G), 0, 'TEST-OP-AGENT', { kind: 'server', index: 0 }))
      .toBeDefined()
  })

  it('skips face-down slots for produce/consume', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-MCP-FILESYSTEM',
      disabled: false,
    }]
    // Scratchpad produces a generic; then a face-down call; then a card whose
    // cost the Scratchpad's output should still be able to pay.
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-AGENT', 'TEST-OP-WORKFLOW-A']
    playToContext(mv(G), 0, 'TEST-OP-SCRATCHPAD', [])
    callInstalled(mv(G), 0, 'TEST-OP-AGENT', { kind: 'server', index: 0 })
    playToContext(mv(G), 0, 'TEST-OP-WORKFLOW-A', [])

    expect(G.contexts[0]!.slots).toHaveLength(3)
    // The chain looked through the face-down card to spend the Scratchpad's output.
    expect(G.contexts[0]!.slots[0]!.outputsRemaining.generic).toBe(0)
  })
})

describe('model upgrade', () => {
  it('replaces the installed model', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-MODEL-FRONTIER']
    G.roundPool = { capital: 2, attention: 0, technology: 1, generic: 0 }

    upgradeModel(mv(G), 'TEST-OP-MODEL-FRONTIER', [])
    expect(G.installedModelId).toBe('TEST-MODEL-FRONTIER')
  })
})

describe('ecosystem discount', () => {
  it('applies when a same-ecosystem card is already in play', () => {
    const G = emptyGameState()
    const subagent = getOperatorCard('TEST-OP-SUBAGENT') // anthropic

    expect(ecosystemDiscount(G, subagent)).toBe(0)
    placeInContext(G, 'TEST-OP-AGENT') // anthropic
    expect(ecosystemDiscount(G, subagent)).toBe(1)
  })

  it('does not apply across ecosystems', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-MCP-FILESYSTEM') // oss
    expect(ecosystemDiscount(G, getOperatorCard('TEST-OP-SUBAGENT'))).toBe(0)
  })
})

describe('features', () => {
  it('picking a feature applies its effect and counts down the gate', () => {
    const G = emptyGameState()
    G.phase = 'reveal'
    G.featureOffer = ['TEST-FEAT-CACHING']
    G.pendingFeaturePicks = { remaining: 1 }

    pickFeature(mv(G), 'TEST-FEAT-CACHING')
    expect(G.roundPool.technology).toBe(1)
    expect(G.activeFeatureIds).toContain('TEST-FEAT-CACHING')
    expect(G.pendingFeaturePicks).toBeNull()
  })

  it('can be declined', () => {
    const G = emptyGameState()
    G.phase = 'reveal'
    G.featureOffer = ['TEST-FEAT-CACHING']
    G.pendingFeaturePicks = { remaining: 2 }

    skipFeaturePicks(mv(G))
    expect(G.pendingFeaturePicks).toBeNull()
  })
})

describe('responses', () => {
  it('cleanses injected pollution', () => {
    const G = emptyGameState()
    G.phase = 'response'
    G.operatorHand = ['TEST-OP-GUARDRAIL']
    G.roundPool.attention = 1
    G.injectedContributions = [
      { color: 'pink', shape: 'hexagon' },
      { color: 'pink', shape: 'pentagon' },
      { color: 'pink', shape: 'circle' },
    ]

    playResponse(mv(G), 'TEST-OP-GUARDRAIL', [])
    expect(G.injectedContributions).toHaveLength(1)
  })

  it('restores a subverted card', () => {
    const G = emptyGameState()
    G.phase = 'response'
    placeInContext(G, 'TEST-OP-AGENT')
    G.contexts[0]!.slots[0]!.subverted = true
    G.operatorHand = ['TEST-OP-PATCH']
    G.roundPool.technology = 1

    playResponse(mv(G), 'TEST-OP-PATCH', [], 0, 0)
    expect(G.contexts[0]!.slots[0]!.subverted).toBe(false)
  })
})

describe('phase advance guards', () => {
  it('will not leave the Entropy phase with an unresolved stack', () => {
    const G = emptyGameState()
    G.phase = 'entropy'
    G.entropyStack = ['TEST-EN-STATIC']

    expect(advancePhase(mv(G))).toBeDefined()
    expect(G.phase).toBe('entropy')
  })

  it('will not advance while a gate is open', () => {
    const G = emptyGameState()
    G.phase = 'reveal'
    G.pendingFeaturePicks = { remaining: 1 }

    expect(advancePhase(mv(G))).toBeDefined()
    expect(G.phase).toBe('reveal')
  })

  it('walks the round loop in order', () => {
    const G = emptyGameState()
    G.phase = 'reveal'
    advancePhase(mv(G))
    expect(G.phase).toBe('play')
    advancePhase(mv(G))
    expect(G.phase).toBe('entropy')
    advancePhase(mv(G))
    expect(G.phase).toBe('response')
    advancePhase(mv(G))
    expect(G.phase).toBe('evalCheck')
  })
})
