/**
 * Shared helpers for the economy: drawing, the Entropy feed, and the ecosystem
 * discount. Kept separate from the move handlers so they can be unit-tested
 * without going through boardgame.io.
 *
 * These mutate the state in place — callers pass Immer drafts from move
 * handlers (boardgame.io v0.50 wraps G in Immer).
 */
import {
  DEFAULT_ENTROPY_FEED, ECOSYSTEM_DISCOUNT_PIPS, HAND_SIZE,
} from '../constants'
import type { MCState } from '../types'
import { getOperatorCard } from '../cards/registry'
import type { OperatorCardDef } from '../cards/types'
import type { PitchAssignment } from './ioFlow'

/** Append a line to the play log. */
export function log(G: MCState, line: string): void {
  G.log.push(`R${G.round} ${G.phase}: ${line}`)
}

/**
 * Draw `n` cards from the top of the Operator deck.
 *
 * BEST-GUESS: an empty deck is a no-op with a log line — no reshuffle. The
 * design says "your deck is the thing that depletes" (§4 pitch economy), so
 * reshuffling would undercut the theme; but nothing says what happens at zero,
 * hence the tag.
 */
export function draw(G: MCState, n: number, reason: string): number {
  let drawn = 0
  for (let i = 0; i < n; i++) {
    const card = G.operatorDeck.shift()
    if (card === undefined) {
      log(G, `deck empty — cannot draw (${reason})`)
      break
    }
    G.operatorHand.push(card)
    drawn++
  }
  if (drawn > 0) log(G, `drew ${drawn} (${reason})`)
  return drawn
}

/**
 * Feed the Entropy economy (design §4): move `n` cards from the top of the
 * Entropy deck onto the LIFO stack.
 *
 * The Tracing feature's `ignoreFirstFeed` consumes itself here.
 * BEST-GUESS: an empty Entropy deck stops the feed, logged, no reshuffle.
 */
export function feedEntropy(G: MCState, n: number, reason: string): number {
  if (n <= 0) return 0

  if (G.ignoreNextFeed) {
    G.ignoreNextFeed = false
    log(G, `Tracing absorbed the Entropy feed (${reason})`)
    return 0
  }

  let fed = 0
  for (let i = 0; i < n; i++) {
    const card = G.entropyDeck.shift()
    if (card === undefined) {
      log(G, `Entropy deck empty — nothing to feed (${reason})`)
      break
    }
    G.entropyStack.push(card)
    fed++
  }
  if (fed > 0) {
    G.entropyFedThisRound += fed
    log(G, `fed ${fed} Entropy (${reason})`)
  }
  return fed
}

/** How much Entropy a card feeds when played or pitched. */
export const feedCostOf = (def: OperatorCardDef): number =>
  def.entropyFeed ?? DEFAULT_ENTROPY_FEED

/** Every Operator card currently in play (face-up Context cards, installed
 *  servers, attached Skills) — the population the ecosystem discount and
 *  targeted Entropy look at. Face-down CALL slots are excluded: their printed
 *  face is irrelevant while they sit face-down. */
export function cardsInPlay(G: MCState): string[] {
  const ids: string[] = []
  for (const chain of G.contexts) {
    for (const slot of chain.slots) {
      if (!slot.faceDown) ids.push(slot.cardId)
    }
  }
  for (const server of G.servers) ids.push(server.traitCardId)
  for (const attachment of G.skillAttachments) ids.push(attachment.skillCardId)
  return ids
}

/**
 * Ecosystem discount (design §4: "Some cards discount cost for other
 * same-keyword cards").
 *
 * BEST-GUESS(Q6): a card with an ecosystem gets ECOSYSTEM_DISCOUNT_PIPS generic
 * pips waived if a card of the same ecosystem is already in play. Mixing simply
 * forgoes this — no penalty (locked).
 */
export function ecosystemDiscount(G: MCState, def: OperatorCardDef): number {
  if (!def.ecosystem) return 0
  const match = cardsInPlay(G).some((id) => {
    const other = getOperatorCard(id)
    return other.ecosystem === def.ecosystem
  })
  return match ? ECOSYSTEM_DISCOUNT_PIPS : 0
}

/** Remove a card from the Operator's hand (or claw hand — design §4 lets the
 *  completed Claw act as a second hand). Returns which zone it came from. */
export function removeFromHands(G: MCState, cardId: string): 'hand' | 'claw' | null {
  const handIx = G.operatorHand.indexOf(cardId)
  if (handIx >= 0) {
    G.operatorHand.splice(handIx, 1)
    return 'hand'
  }
  const clawIx = G.clawHand.indexOf(cardId)
  if (clawIx >= 0) {
    G.clawHand.splice(clawIx, 1)
    return 'claw'
  }
  return null
}

/**
 * Refill the hand to HAND_SIZE (owner ruling, 2026-08-10).
 *
 * Called after every action that spends cards. The hand is a constant; the
 * DECK is what depletes — and running it out is one of the two ways the game
 * can end (see phaseHelpers.endMatch).
 */
export function refillHand(G: MCState, reason: string): number {
  const needed = HAND_SIZE - G.operatorHand.length
  if (needed <= 0) return 0
  return draw(G, needed, reason)
}

/**
 * Pitch cards to pay a cost: hand → discard, feed Entropy per the pitch's
 * contribution match (1 exact / 2 partial / 3 neither), then refill.
 */
export function executePitches(
  G: MCState,
  pitches: PitchAssignment[],
  reason: string,
): void {
  for (const { cardId, entropy, match } of pitches) {
    const def = getOperatorCard(cardId)
    removeFromHands(G, cardId)
    G.operatorDiscard.push(cardId)
    feedEntropy(G, entropy, `pitched ${def.name} (${match} match)`)
  }
  if (pitches.length > 0) refillHand(G, `${reason} pitches`)
}
