/**
 * Eval-check-phase moves: relay decisions and the failed-eval scrap.
 *
 * Scoring itself happens on ENTRY to the phase (phaseHelpers.enterEvalCheck),
 * so by the time these moves are legal the Operator already knows the verdict.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { OPERATOR_SEAT, SCRAP_REMOVES } from '../constants'
import type { MCState } from '../types'
import { getOperatorCard } from '../cards/registry'
import { log } from './playHelpers'
import type { MoveCtx } from './playMoves'

function canAct(G: MCState, playerID?: string | null): boolean {
  if (G.matchWinner) return false
  if (G.phase !== 'evalCheck') return false
  return playerID == null || playerID === OPERATOR_SEAT
}

/**
 * Mark/unmark a Context card to relay into the next round (design §4:
 * "Stateless by default ... You may relay a card to the next round instead").
 * The Entropy cost of a non-Durable relay is charged at rollover.
 */
export function toggleRelay({ G, playerID }: MoveCtx, chainIx: number, slotIx: number) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (G.pendingFailureScrap) return INVALID_MOVE

  const slot = G.contexts[chainIx]?.slots[slotIx]
  if (!slot) return INVALID_MOVE

  slot.relayed = !slot.relayed
  const def = getOperatorCard(slot.cardId)
  const durable = (def.keywords ?? []).includes('durable')
  log(G, `${slot.relayed ? 'will relay' : 'will not relay'} ${def.name}${slot.relayed && !durable ? ' (feeds Entropy)' : ''}`)
}

/**
 * Scrap your own engine to shed persisting Entropy after a failed eval
 * (design §4: "a Durable card removes 3 Entropy, a Setup card removes 5").
 */
export function scrapForEntropy({ G, playerID }: MoveCtx, cardId: string) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (!G.pendingFailureScrap) return INVALID_MOVE

  // Find the card in play: Context slots first, then servers.
  for (let chainIx = 0; chainIx < G.contexts.length; chainIx++) {
    const chain = G.contexts[chainIx]
    if (!chain) continue
    const slotIx = chain.slots.findIndex((s) => s.cardId === cardId)
    if (slotIx < 0) continue

    const def = getOperatorCard(cardId)
    const keywords = def.keywords ?? []
    const removes = keywords.includes('setup')
      ? SCRAP_REMOVES.setup
      : keywords.includes('durable')
        ? SCRAP_REMOVES.durable
        : 0
    if (removes === 0) return INVALID_MOVE

    chain.slots.splice(slotIx, 1)
    G.operatorDiscard.push(cardId)
    shedEntropy(G, removes, def.name)
    return
  }

  const serverIx = G.servers.findIndex((s) => s.traitCardId === cardId)
  if (serverIx >= 0) {
    const server = G.servers[serverIx]
    if (!server) return INVALID_MOVE
    G.operatorDiscard.push(server.substrateCardId, server.traitCardId)
    G.servers.splice(serverIx, 1)
    shedEntropy(G, SCRAP_REMOVES.setup, getOperatorCard(cardId).name)
    return
  }

  return INVALID_MOVE
}

/** Remove up to `n` cards from the Entropy that would otherwise persist. */
function shedEntropy(G: MCState, n: number, sourceName: string): void {
  let shed = 0
  for (let i = 0; i < n; i++) {
    // Shed from this round's resolved pile first (that is what persists on a
    // failure), then from anything still on the stack.
    const fromResolved = G.entropyResolved.pop()
    if (fromResolved !== undefined) {
      G.entropyDiscard.push(fromResolved)
      shed++
      continue
    }
    const fromStack = G.entropyStack.pop()
    if (fromStack !== undefined) {
      G.entropyDiscard.push(fromStack)
      shed++
      continue
    }
    break
  }
  log(G, `scrapped ${sourceName} — shed ${shed} Entropy`)
}

/** Accept the outcome and close the scrap window. */
export function acceptOutcome({ G, playerID }: MoveCtx) {
  if (!canAct(G, playerID)) return INVALID_MOVE
  if (!G.pendingFailureScrap) return INVALID_MOVE

  G.pendingFailureScrap = null
  log(G, 'outcome accepted')
}
