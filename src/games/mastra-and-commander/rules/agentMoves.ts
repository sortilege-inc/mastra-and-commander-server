/**
 * Moves that put Agents into play and pay printed abilities.
 *
 * These implement mechanics the 2026-08-13 card set prints:
 *  - **Parallelism** spawns Agents, each opening its own Context row.
 *  - **Fable** prints `Entropy 1:` — an ability whose COST is Entropy.
 *  - **Sandbox** prints an activated ability, and a Slot that can hold an
 *    Entropy card diverted out of the stack.
 *  - **Y-Combinator** searches the operator deck for an upgrade.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { DEFAULT_CONTEXT_CEILING } from '../constants'
import type { MCState } from '../types'
import { getLoadout, getModel, getOperatorCard } from '../cards/registry'
import { FEATURE_CARDS, LOADOUT_CARDS, MODEL_CARDS } from '../cards/cardSet'
import type { MoveCtx } from './playMoves'
import { openContext, contextCeiling } from './contextRows'
import { feedEntropy, log, refillHand, removeFromHands } from './playHelpers'
import { planPayment, applyPlanToSources, toPipCounts } from './ioFlow'

/** Shared guard: Operator seat, play phase, no gate blocking. */
function canAct(G: MCState, playerID?: string | null): boolean {
  if (playerID != null && playerID !== '0') return false
  if (G.matchWinner) return false
  if (G.phase !== 'play') return false
  return G.pendingFeaturePicks === null
    && G.pendingEntropyTarget === null
    && G.pendingFailureScrap === null
}

/**
 * Play a Feature that spawns Agents (Parallelism).
 *
 * Each Agent opens a row as a CHILD of the row it was spawned from — that is
 * what "subagent" means. The card's own `entropy` overrides the usual per-card
 * feed ("Resolve: only 1 entropy is added this way").
 */
export function spawnAgents(
  { G, playerID }: MoveCtx,
  cardId: string,
  parentChainIx: number,
) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId) && !G.clawHand.includes(cardId)) return INVALID_MOVE
  if (!G.contexts[parentChainIx]) return INVALID_MOVE

  const def = FEATURE_CARDS.find((f) => f.id === cardId)
  if (!def || def.effect.kind !== 'spawnAgents') return INVALID_MOVE

  removeFromHands(G, cardId)
  G.operatorDiscard.push(cardId)
  log(G, `played ${def.name}`)

  const ceiling = contextCeiling(G, DEFAULT_CONTEXT_CEILING)
  for (let i = 0; i < def.effect.n; i++) {
    openContext(G, parentChainIx, ceiling, `spawned by ${def.name}`)
  }
  // One feed for the whole card, not one per Agent.
  feedEntropy(G, def.effect.entropy, def.name)
  refillHand(G, def.name)
}

/**
 * Pay a Model's Entropy-priced ability (Fable's "Entropy 1:").
 *
 * The cost is paid by feeding that many cards from the Entropy deck onto the
 * stack (owner ruling, 2026-08-13) — the only way to buy Entropy on purpose.
 */
export function useModelAbility({ G, playerID }: MoveCtx) {
  if (!canAct(G, playerID)) return INVALID_MOVE

  const def = getModel(G.installedModelId)
  if (!def.activated) return INVALID_MOVE

  feedEntropy(G, def.activated.cost.entropy, `${def.name}'s ability`)
  for (const pip of def.activated.gain) G.roundPool[pip] += 1
  log(G, `${def.name}: paid ${def.activated.cost.entropy} Entropy, gained `
    + def.activated.gain.join(' '))
}

/**
 * Pay a Loadout's activated ability (Sandbox: pay Value+Attention, mill 1,
 * gain Automation).
 */
export function useLoadoutAbility(
  { G, playerID }: MoveCtx,
  loadoutId: string,
  pitchIds: string[] = [],
) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (!G.loadout.includes(loadoutId)) return INVALID_MOVE

  const def = getLoadout(loadoutId)
  if (!def.activated) return INVALID_MOVE

  const pitchDefs = []
  for (const id of pitchIds) {
    if (!G.operatorHand.includes(id) && !G.clawHand.includes(id)) return INVALID_MOVE
    pitchDefs.push(getOperatorCard(id))
  }

  const result = planPayment(
    def.activated.cost.pips,
    { prevOutputs: toPipCounts([]), roundPool: G.roundPool },
    pitchDefs,
    null,
    0,
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  for (const { cardId, entropy } of result.plan.pitches) {
    removeFromHands(G, cardId)
    G.operatorDiscard.push(cardId)
    feedEntropy(G, entropy, `pitched for ${def.name}`)
  }

  for (let i = 0; i < (def.activated.mill ?? 0); i++) {
    const milled = G.operatorDeck.shift()
    if (milled !== undefined) G.operatorDiscard.push(milled)
  }
  for (const pip of def.activated.gain) G.roundPool[pip] += 1
  log(G, `${def.name}: gained ${def.activated.gain.join(' ')}`)
  refillHand(G, def.name)
}

/**
 * Y-Combinator's tutor: search the operator deck for a Model / Loadout /
 * Feature and put it into play without feeding Entropy.
 *
 * Upgrades shuffle into the operator deck precisely so this can find them
 * (owner ruling, 2026-08-13). A Model replaces the installed one; a Loadout
 * joins the loadout; a Feature goes to the active list.
 */
export function tutorUpgrade(
  { G, playerID }: MoveCtx,
  eventCardId: string,
  foundCardId: string,
) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(eventCardId) && !G.clawHand.includes(eventCardId)) {
    return INVALID_MOVE
  }
  const ix = G.operatorDeck.indexOf(foundCardId)
  if (ix === -1) return INVALID_MOVE

  const def = getOperatorCard(eventCardId)
  if (def.event?.kind !== 'tutor') return INVALID_MOVE
  if (!tutorable(foundCardId)) return INVALID_MOVE

  // Spend the Event itself.
  removeFromHands(G, eventCardId)
  G.operatorDiscard.push(eventCardId)
  G.operatorDeck.splice(ix, 1)

  if (MODEL_CARDS.some((m) => m.id === foundCardId)) {
    G.installedModelId = foundCardId
    log(G, `${def.name}: installed ${getModel(foundCardId).name}`)
  } else if (LOADOUT_CARDS.some((l) => l.id === foundCardId)) {
    G.loadout.push(foundCardId)
    log(G, `${def.name}: added ${getLoadout(foundCardId).name} to the loadout`)
  } else {
    G.activeFeatureIds.push(foundCardId)
    log(G, `${def.name}: brought in ${foundCardId}`)
  }

  // "without adding entropy" — the tutor itself is free of the usual feed.
  refillHand(G, def.name)
}

/** Is this a card the tutor may find? */
export function tutorable(cardId: string): boolean {
  return MODEL_CARDS.some((m) => m.id === cardId)
    || LOADOUT_CARDS.some((l) => l.id === cardId)
    || FEATURE_CARDS.some((f) => f.id === cardId)
}

/**
 * Sandbox's Slot: divert the top of the Entropy stack into an empty slot
 * instead of resolving it (owner ruling, 2026-08-13).
 *
 * While held, the card is inert — "its text box is blank" — so it neither
 * resolves now nor joins the threat row.
 */
export function divertToSlot({ G, playerID }: MoveCtx, loadoutId: string) {
  if (playerID != null && playerID !== '0') return INVALID_MOVE
  if (G.phase !== 'entropy') return INVALID_MOVE
  if (G.pendingEntropyTarget !== null) return INVALID_MOVE
  if (!G.loadout.includes(loadoutId)) return INVALID_MOVE

  const def = getLoadout(loadoutId)
  if (!def.slot) return INVALID_MOVE

  const held = G.slotted.filter((entry) => entry.loadoutId === loadoutId).length
  if (held >= def.slot.capacity) return INVALID_MOVE

  const top = G.entropyStack.pop()
  if (top === undefined) return INVALID_MOVE

  G.slotted.push({ loadoutId, cardId: top })
  log(G, `diverted an Entropy card into ${def.name} — held inert`)
}
