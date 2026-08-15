/**
 * Which printed mechanics the engine cannot act on yet.
 *
 * The 2026-08-13 card set prints more than the engine has grown. Rather than
 * omit those payloads (making a card look complete) or fake them (making it
 * look right while playing wrong), they are transcribed with an `unimplemented`
 * flag — and surfaced here so the board can SAY SO on the card.
 *
 * A card listed by this module is playable; the part named just doesn't happen
 * yet. Delete the flag in cardSet.ts when the mechanic lands.
 */
import {
  getEntropyCard, getLoadout, getModel, getOperatorCard, hasOperatorCard,
} from './registry'
import { LOADOUT_CARDS, MODEL_CARDS, ENTROPY_CARDS } from './cardSet'

/** Human-readable note for a card, or null when it is fully wired. */
export function unimplementedNote(cardId: string): string | null {
  if (hasOperatorCard(cardId)) {
    const def = getOperatorCard(cardId)
    if (def.rulesText.startsWith('STUB')) {
      return 'Mechanics not designed yet — this card does nothing.'
    }
    if (def.event?.kind === 'tutor' && def.event.unimplemented) {
      return 'Search-your-deck is not wired yet.'
    }
    if (def.response?.kind === 'peekEntropyDeck' && def.response.unimplemented) {
      return 'Looking at the Entropy deck is not wired yet.'
    }
    return null
  }

  if (LOADOUT_CARDS.some((l) => l.id === cardId)) {
    const def = getLoadout(cardId)
    if (def.slot?.unimplemented) return 'The Entropy slot is not wired yet.'
    return null
  }

  if (MODEL_CARDS.some((m) => m.id === cardId)) {
    getModel(cardId)
    return null
  }

  if (ENTROPY_CARDS.some((e) => e.id === cardId)) {
    const effect = getEntropyCard(cardId).effect
    if (effect.kind === 'ongoing' && effect.trigger?.unimplemented) {
      return 'Its Trigger is not wired yet — it will not leave on its own.'
    }
    if (effect.kind === 'hijack' && effect.unimplemented) {
      return 'The constrained eval swap is not wired yet — it does nothing.'
    }
    return null
  }

  return null
}
