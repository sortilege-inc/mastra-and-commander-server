/**
 * Test fixtures.
 *
 * `freshGameState()` builds from the REAL setup path, so fixtures can't rot as
 * the state shape grows — a field added to MCState appears here automatically.
 * (Same reasoning as tcggg's testing/fixtures.ts.)
 */
import type { CallTarget, MCState, ServerInstall } from '../types'
import { AGENT_TOKEN_ID, DEFAULT_CONTEXT_CEILING } from '../constants'
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
  // Most rules tests act in the play phase; the ones that don't set their own.
  // Without this every guarded move is (correctly) rejected and the test reads
  // as a rules failure rather than a fixture one.
  G.phase = 'play'
  G.operatorHand = []
  // A small stock deck. NOT empty: an empty deck now means "the Operator has
  // cycled their deck", which ends the match — so a zero-length deck here would
  // silently end every test that rolls a round over. Tests that specifically
  // want an exhausted deck set it themselves.
  G.operatorDeck = Array(20).fill(CARDS.cheap)
  // enterReveal has already run the loadout auto-pitch, so the discard is
  // non-empty by the time we get here. Clear it so tests start from zero.
  G.operatorDiscard = []
  // One context, owned by an Agent token — the shape enterReveal produces.
  G.contexts = [{
    slots: [],
    closed: false,
    ceiling: DEFAULT_CONTEXT_CEILING,
    parentChainIx: null,
    ownerCardId: AGENT_TOKEN_ID,
  }]
  G.threats = []
  G.slotted = []
  G.servers = []
  G.skillAttachments = []
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

/**
 * Real cards, named by the ROLE a test needs.
 *
 * Tests refer to these rather than to raw ids so a rename in the card set is a
 * one-line fix here, not a sweep through the suite — which is exactly what went
 * wrong when the placeholder set was retired. Where a test needs a specific
 * printed value it should read it off the definition, not hard-code it.
 */
export const CARDS = {
  /** Cheapest operator card: 1 wild in, 1 attention out. */
  cheap: 'OP-SOCIAL-MEDIA-MANAGER',
  /** Prints `Attach:` — can ride a loadout item. */
  attachable: 'OP-SOCIAL-MEDIA-MANAGER',
  /** Prints `MCP:` — can be installed as a server. Produces automation. */
  installable: 'OP-BROWSERBASE',
  /** Has a `response` payload. */
  response: 'OP-HUMAN-IN-THE-LOOP',
  /** Has an `event` payload (the tutor). */
  event: 'OP-YC',
  feature: 'FEAT-PARALLEL-SUBAGENTS',
  model: 'MODEL-FABLE',
  loadout: 'LOADOUT-SANDBOX',
  framework: 'MASTRA',
  agentToken: AGENT_TOKEN_ID,
  /** Ongoing: every context's ceiling drops by 1. */
  threatCeiling: 'EN-TOKEN-LIMITER',
  /** Ongoing: blanks cards producing attention. */
  threatBlank: 'EN-PII-LEAK',
  /** Ongoing: extra feed when an automation producer lands. */
  threatFeed: 'EN-MODEL-COLLAPSE',
  /** Initialize: attaches to the top automation producer. */
  initialize: 'EN-JAILBREAK',
  /** Constrained hijack. */
  hijack: 'EN-ALGORITHMIC-INTERVENTION',
  evalEasy: 'EV-PERSONAL-TECH-SUPPORT',
  evalHard: 'EV-RECRUITER-AGENT',
} as const

/** Install a server directly, bypassing the move (which charges resources). */
export function installServerDirect(
  G: MCState,
  traitCardId = CARDS.installable,
  substrateCardId = CARDS.cheap,
): ServerInstall {
  const server: ServerInstall = {
    id: `srv-${G.nextServerSeq}`,
    substrateCardId,
    traitCardId,
    disabled: false,
  }
  G.nextServerSeq += 1
  G.servers.push(server)
  return server
}

/** Put a resolved Ongoing card straight onto the threat row. */
export function addThreat(G: MCState, cardId: string): void {
  G.threats.push({ cardId, since: G.round, triggerProgress: 0, attachedTo: null })
}

/** Open an extra context, optionally nested under another. */
export function addContext(G: MCState, parentChainIx: number | null = null): number {
  G.contexts.push({
    slots: [],
    closed: false,
    ceiling: DEFAULT_CONTEXT_CEILING,
    parentChainIx,
    ownerCardId: AGENT_TOKEN_ID,
  })
  return G.contexts.length - 1
}
