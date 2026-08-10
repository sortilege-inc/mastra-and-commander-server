/**
 * Play-phase moves (design §2 step 2): the Operator builds the Context, pitching
 * cards to pay costs and drawing one card per card pitched. Every play and every
 * pitch feeds the Entropy economy.
 *
 * All moves here are Operator-only and guard on phase + open gates. Move
 * signature is boardgame.io v0.50:
 *   ({ G, ctx, playerID, random }, ...args) => void | INVALID_MOVE
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import {
  CLAW_COMPLETE_COUNT, COMMANDER_ABILITY_PIP, INSTALLABLE_TRAITS, OPERATOR_SEAT,
  RAG_CLEAR_COUNT, RAG_STEP_COUNT, TRAIT_EVENT, TRAIT_MODEL,
} from '../constants'
import type { MCState } from '../types'
import { getCommander, getOperatorCard } from '../cards/registry'
import { applyPlanToSources, chainOutputs, planPayment, toPipCounts } from './ioFlow'
import {
  draw, ecosystemDiscount, executePitches, feedCostOf, feedEntropy, log,
  removeFromHands,
} from './playHelpers'

/** The subset of the boardgame.io move context these handlers use. */
export interface MoveCtx {
  G: MCState
  playerID?: string | null
  random?: { Die: (spotvalue: number) => number; Shuffle: <T>(deck: T[]) => T[] }
}

/** Shared guard: Operator seat, play phase, no gate blocking. */
function canOperatorAct(G: MCState, playerID?: string | null): boolean {
  if (playerID != null && playerID !== OPERATOR_SEAT) return false
  if (G.matchWinner) return false
  return G.pendingFeaturePicks === null
    && G.pendingEntropyTarget === null
    && G.pendingFailureScrap === null
}

/** Look up pitch cards, rejecting any not actually held. */
function resolvePitches(G: MCState, pitchIds: string[]) {
  const defs = []
  for (const id of pitchIds) {
    if (!G.operatorHand.includes(id) && !G.clawHand.includes(id)) return null
    defs.push(getOperatorCard(id))
  }
  return defs
}

/**
 * Play a card into a Context chain (design §4 "Context — the window & the I/O
 * flow"). Cost is paid first from the previous card's outputs, then the round
 * pool, then by pitching.
 */
export function playToContext(
  { G, playerID }: MoveCtx,
  processIx: number,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE

  const chain = G.contexts[processIx]
  if (!chain || chain.closed) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId) && !G.clawHand.includes(cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  // Events and Responses have their own moves/phases.
  if (def.traits.includes(TRAIT_EVENT)) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const lastSlot = chain.slots[chain.slots.length - 1]
  const result = planPayment(
    def.consume,
    {
      prevOutputs: chainOutputs(lastSlot?.outputsRemaining),
      roundPool: G.roundPool,
    },
    pitchDefs,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, lastSlot?.outputsRemaining ?? null, G.roundPool)
  executePitches(G, pitchIds, `playing ${def.name}`)

  removeFromHands(G, cardId)
  chain.slots.push({
    cardId,
    outputsRemaining: toPipCounts(def.produce),
    relayed: false,
    subverted: false,
  })
  log(G, `played ${def.name} into the Context`)
  feedEntropy(G, feedCostOf(def), `played ${def.name}`)
}

/** Play an Event-trait card — pays like a Context card but resolves an effect
 *  and goes to the discard instead of joining a chain. */
export function playEvent(
  { G, playerID }: MoveCtx,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId) && !G.clawHand.includes(cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  if (!def.traits.includes(TRAIT_EVENT) || !def.event) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  // Events pay from the round pool and pitches only — they are not part of a
  // chain, so there are no previous outputs to draw on.
  const result = planPayment(
    def.consume,
    { prevOutputs: toPipCounts([]), roundPool: G.roundPool },
    pitchDefs,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, pitchIds, `playing ${def.name}`)
  removeFromHands(G, cardId)
  G.operatorDiscard.push(cardId)
  log(G, `played ${def.name}`)

  switch (def.event.kind) {
    case 'gainPips':
      for (const pip of def.event.pips) G.roundPool[pip] += 1
      log(G, `gained ${def.event.pips.join(' ')}`)
      break
    case 'draw':
      draw(G, def.event.n, def.name)
      break
    case 'openProcess':
      // Parallelism (design §4): grants an additional concurrent Process.
      G.processLimit += 1
      log(G, `Process limit is now ${G.processLimit}`)
      break
  }

  feedEntropy(G, feedCostOf(def), `played ${def.name}`)
}

/**
 * Commander ability (design §4: the commander "offers a ramp ability").
 * PLACEHOLDER — the printed Mastra card is pending redesign.
 */
export function useCommanderAbility({ G, playerID }: MoveCtx, pitchCardId: string) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(pitchCardId)) return INVALID_MOVE

  const commander = getCommander(G.commanderId)
  const pitchDef = getOperatorCard(pitchCardId)
  if (!pitchDef.consume.includes(COMMANDER_ABILITY_PIP)) return INVALID_MOVE

  executePitches(G, [pitchCardId], commander.name)
  for (const pip of commander.abilityGrant) G.roundPool[pip] += 1
  log(G, `${commander.name}: gained ${commander.abilityGrant.join(' ')}`)
}

/**
 * Install a server (design §4 "Installs / Servers — the attack surface"):
 * discard a card face-down as the substrate, then play an MCP / Skill / Tool
 * card onto it. BEST-GUESS(Q9): the substrate comes from the Operator's hand.
 */
export function installServer(
  { G, playerID }: MoveCtx,
  substrateCardId: string,
  traitCardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (substrateCardId === traitCardId) return INVALID_MOVE
  if (!G.operatorHand.includes(substrateCardId)) return INVALID_MOVE
  if (!G.operatorHand.includes(traitCardId)) return INVALID_MOVE

  const traitDef = getOperatorCard(traitCardId)
  const installable = traitDef.traits.some((t) =>
    (INSTALLABLE_TRAITS as readonly string[]).includes(t))
  if (!installable) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    traitDef.consume,
    { prevOutputs: toPipCounts([]), roundPool: G.roundPool },
    pitchDefs,
    ecosystemDiscount(G, traitDef),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, pitchIds, `installing ${traitDef.name}`)

  removeFromHands(G, substrateCardId)
  removeFromHands(G, traitCardId)
  G.servers.push({ substrateCardId, traitCardId, disabled: false })
  log(G, `installed ${traitDef.name} on a face-down server`)

  // The face-down discard is Operator activity, so it feeds (design §4).
  feedEntropy(G, 1, 'server substrate')
  feedEntropy(G, feedCostOf(traitDef), `installed ${traitDef.name}`)
}

/**
 * Build one step of the RAG track (design §4 "RAG — the anti-entropy engine").
 * Building feeds Entropy — "it's a bet". Completing all four removes some of
 * the stack at random and locks RAG to the final card's Contribution.
 *
 * BEST-GUESS(Q5): steps cost a card but no resources; completion clears
 * RAG_CLEAR_COUNT at random; the lock is the final card's first contribution.
 */
export function buildRagStep({ G, playerID, random }: MoveCtx, cardId: string) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId)) return INVALID_MOVE
  if (G.ragSteps.length >= RAG_STEP_COUNT) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  removeFromHands(G, cardId)
  G.ragSteps.push(cardId)
  log(G, `RAG step ${G.ragSteps.length}/${RAG_STEP_COUNT}: ${def.name}`)
  feedEntropy(G, feedCostOf(def), 'RAG step')

  if (G.ragSteps.length === RAG_STEP_COUNT) {
    const contribution = def.contributes[0]
    G.ragLockedContribution = contribution ?? null
    let removed = 0
    for (let i = 0; i < RAG_CLEAR_COUNT && G.entropyStack.length > 0; i++) {
      const ix = random ? random.Die(G.entropyStack.length) - 1 : 0
      const [pulled] = G.entropyStack.splice(ix, 1)
      if (pulled) {
        G.entropyDiscard.push(pulled)
        removed++
      }
    }
    log(G, `RAG complete — removed ${removed} Entropy at random; locked to ${contribution ? `${contribution.color} ${contribution.shape}` : 'nothing'}`)
  }
}

/** Reset the RAG track to re-spec it for a different eval (design §4). */
export function resetRag({ G, playerID }: MoveCtx) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (G.ragSteps.length === 0) return INVALID_MOVE

  G.operatorDiscard.push(...G.ragSteps)
  G.ragSteps = []
  G.ragLockedContribution = null
  log(G, 'RAG track reset')
}

/**
 * Load a card into the Claw (design §4): feed cards face-down until it is
 * complete, then it acts as a second, parallel hand.
 * BEST-GUESS(Q7): completion at CLAW_COMPLETE_COUNT cards; loading feeds 1.
 */
export function loadClaw({ G, playerID }: MoveCtx, cardId: string) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId)) return INVALID_MOVE
  if (G.clawHand.length > 0) return INVALID_MOVE // already complete and unspent

  removeFromHands(G, cardId)
  G.clawPile.push(cardId)
  log(G, `loaded the Claw (${G.clawPile.length}/${CLAW_COMPLETE_COUNT})`)
  feedEntropy(G, 1, 'Claw load')

  if (G.clawPile.length >= CLAW_COMPLETE_COUNT) {
    G.clawHand = [...G.clawPile]
    G.clawPile = []
    log(G, 'Claw complete — available as a second hand')
  }
}

/** Upgrade the installed Model (design §4: "can be upgraded over the game"). */
export function upgradeModel(
  { G, playerID }: MoveCtx,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  if (!def.traits.includes(TRAIT_MODEL)) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    def.consume,
    { prevOutputs: toPipCounts([]), roundPool: G.roundPool },
    pitchDefs,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, pitchIds, `upgrading to ${def.name}`)
  removeFromHands(G, cardId)

  // BEST-GUESS(Q11): the Model card id doubles as the installed model's id
  // (testSet keeps them in sync).
  G.installedModelId = 'TEST-MODEL-FRONTIER'
  log(G, `upgraded model to ${def.name}`)
  feedEntropy(G, feedCostOf(def), `upgraded to ${def.name}`)
}

/** Open an additional Process, if Parallelism has raised the limit. */
export function openProcess({ G, playerID }: MoveCtx) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (G.contexts.length >= G.processLimit) return INVALID_MOVE

  G.contexts.push({ slots: [], closed: false })
  log(G, `opened Process ${G.contexts.length}`)
}

/** Close a Process. BEST-GUESS(Q15): closing is voluntary; a closed Process
 *  still scores ("closes out with or without your results" — design §4). */
export function closeProcess({ G, playerID }: MoveCtx, processIx: number) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  const chain = G.contexts[processIx]
  if (!chain || chain.closed) return INVALID_MOVE

  chain.closed = true
  log(G, `closed Process ${processIx + 1}`)
}
