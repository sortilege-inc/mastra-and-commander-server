/**
 * Response-phase moves (design §2 step 4): "The Operator plays responses from
 * their remaining hand to mitigate what the Entropy did."
 *
 * A response is still Operator activity, so it still feeds the Entropy economy.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { OPERATOR_SEAT, TRAIT_RESPONSE } from '../constants'
import type { MCState } from '../types'
import { getOperatorCard } from '../cards/registry'
import { applyPlanToSources, planPayment, toPipCounts } from './ioFlow'
import {
  ecosystemDiscount, executePitches, feedCostOf, feedEntropy, log,
  refillHand, removeFromHands,
} from './playHelpers'
import type { MoveCtx } from './playMoves'

function canRespond(G: MCState, playerID?: string | null): boolean {
  if (G.matchWinner) return false
  if (G.phase !== 'response') return false
  if (playerID != null && playerID !== OPERATOR_SEAT) return false
  return G.pendingEntropyTarget === null && G.pendingFailureScrap === null
}

/**
 * Play a Response-trait card.
 *
 * `targetChainIx`/`targetSlotIx` are only read by `restoreSubverted`.
 */
export function playResponse(
  { G, playerID }: MoveCtx,
  cardId: string,
  pitchIds: string[] = [],
  targetChainIx = 0,
  targetSlotIx = 0,
) {
  if (!canRespond(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId) && !G.clawHand.includes(cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  if (!def.traits.includes(TRAIT_RESPONSE) || !def.response) return INVALID_MOVE

  const pitchDefs = []
  for (const id of pitchIds) {
    if (!G.operatorHand.includes(id) && !G.clawHand.includes(id)) return INVALID_MOVE
    pitchDefs.push(getOperatorCard(id))
  }

  const result = planPayment(
    def.consume,
    { prevOutputs: toPipCounts([]), roundPool: G.roundPool },
    pitchDefs,
    def,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `playing ${def.name}`)
  removeFromHands(G, cardId)
  G.operatorDiscard.push(cardId)
  log(G, `response: ${def.name}`)

  switch (def.response.kind) {
    case 'cleansePollution': {
      const removed = Math.min(def.response.n, G.injectedContributions.length)
      G.injectedContributions.splice(0, removed)
      log(G, `cleansed ${removed} injected contribution(s)`)
      break
    }
    case 'restoreSubverted': {
      const slot = G.contexts[targetChainIx]?.slots[targetSlotIx]
      if (slot?.subverted) {
        slot.subverted = false
        log(G, `restored ${getOperatorCard(slot.cardId).name}`)
      } else {
        log(G, 'nothing to restore')
      }
      break
    }
  }

  feedEntropy(G, feedCostOf(def), `played ${def.name}`)
  refillHand(G, `played ${def.name}`)
}
