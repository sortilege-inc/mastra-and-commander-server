/**
 * The subsystems: play moves, RAG, Claw, servers, models, Processes,
 * ecosystem discounts, features, and responses.
 *
 * Most of these implement BEST-GUESS rules (the design doc leaves them 🟨/❓),
 * so these tests are as much a record of WHAT WE GUESSED as a regression net.
 */
import { describe, expect, it } from 'vitest'
import { CLAW_COMPLETE_COUNT, RAG_STEP_COUNT } from '../constants'
import {
  buildRagStep, closeProcess, installServer, loadClaw, openProcess, playEvent,
  playToContext, resetRag, upgradeModel, useCommanderAbility,
} from './playMoves'
import { playResponse } from './responseMoves'
import { pickFeature, skipFeaturePicks } from './revealMoves'
import { advancePhase } from './phaseMoves'
import { ecosystemDiscount } from './playHelpers'
import { enterReveal } from './phaseHelpers'
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
    expect(G.operatorHand).toHaveLength(0)
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

    const result = playToContext(mv(G), 0, 'TEST-OP-AGENT', [])
    expect(result).toBeDefined() // INVALID_MOVE
    expect(G.contexts[0]!.slots).toHaveLength(0)
  })

  it('pitching pays the cost, draws a card, and feeds Entropy', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT', 'TEST-OP-SUBAGENT'] // subagent cost includes technology
    G.operatorDeck = ['TEST-OP-SCRATCHPAD']
    G.entropyDeck = ['TEST-EN-STATIC', 'TEST-EN-HALLUCINATION', 'TEST-EN-SLOP']

    playToContext(mv(G), 0, 'TEST-OP-AGENT', ['TEST-OP-SUBAGENT'])

    expect(G.contexts[0]!.slots).toHaveLength(1)
    expect(G.operatorDiscard).toContain('TEST-OP-SUBAGENT')
    // Drew 1 for the pitch (locked rule).
    expect(G.operatorHand).toContain('TEST-OP-SCRATCHPAD')
    // Fed for the pitch AND for the play.
    expect(G.entropyStack.length).toBe(2)
  })

  it('honors a card multi-feed', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SWARM']
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

describe('commander ability (placeholder)', () => {
  it('grants resources for pitching an attention-costing card', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-TOOL-WEBSEARCH'] // cost [attention]

    useCommanderAbility(mv(G), 'TEST-OP-TOOL-WEBSEARCH')
    expect(G.roundPool.technology).toBe(3)
    expect(G.operatorDiscard).toContain('TEST-OP-TOOL-WEBSEARCH')
  })

  it('refuses a card whose cost lacks attention', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-AGENT'] // cost [technology]

    expect(useCommanderAbility(mv(G), 'TEST-OP-AGENT')).toBeDefined()
    expect(G.roundPool.technology).toBe(0)
  })
})

describe('RAG track', () => {
  it('completing four steps clears Entropy and locks a contribution', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = [
      'TEST-OP-WORKFLOW-A', 'TEST-OP-WORKFLOW-B',
      'TEST-OP-WORKFLOW-C', 'TEST-OP-AGENT',
    ]
    G.entropyStack = Array(6).fill('TEST-EN-STATIC')
    // Building the track is "a bet" — each step feeds, so the deck must have
    // cards to feed from.
    G.entropyDeck = Array(4).fill('TEST-EN-STATIC')

    for (const id of [...G.operatorHand]) buildRagStep(mv(G), id)

    expect(G.ragSteps).toHaveLength(RAG_STEP_COUNT)
    // Locked to the final card's contribution (Agent → cyan circle).
    expect(G.ragLockedContribution).toEqual({ color: 'cyan', shape: 'circle' })
    // Built 4 steps (feeding 4) then cleared 3 at completion.
    expect(G.entropyStack.length).toBe(6 + 4 - 3)
  })

  it('reset clears the track so it can be re-spec\'d', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-WORKFLOW-A']
    buildRagStep(mv(G), 'TEST-OP-WORKFLOW-A')

    resetRag(mv(G))
    expect(G.ragSteps).toHaveLength(0)
    expect(G.ragLockedContribution).toBeNull()
    expect(G.operatorDiscard).toContain('TEST-OP-WORKFLOW-A')
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

describe('servers', () => {
  it('installs a trait card onto a face-down substrate', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-MCP-FILESYSTEM']
    G.roundPool.technology = 1

    installServer(mv(G), 'TEST-OP-SCRATCHPAD', 'TEST-OP-MCP-FILESYSTEM', [])
    expect(G.servers).toHaveLength(1)
    expect(G.servers[0]!.substrateCardId).toBe('TEST-OP-SCRATCHPAD')
  })

  it('refuses a non-installable trait card', () => {
    const G = emptyGameState()
    G.phase = 'play'
    G.operatorHand = ['TEST-OP-SCRATCHPAD', 'TEST-OP-AGENT']
    G.roundPool.technology = 1

    expect(installServer(mv(G), 'TEST-OP-SCRATCHPAD', 'TEST-OP-AGENT', [])).toBeDefined()
  })

  it('grants resources at the next Reveal', () => {
    const G = emptyGameState()
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-MCP-FILESYSTEM',
      disabled: false,
    }]
    G.roundPool = { capital: 0, attention: 0, technology: 0, generic: 0 }
    enterReveal(G)
    expect(G.roundPool.generic).toBeGreaterThanOrEqual(1)
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
