/**
 * Per-seat redaction of hidden information.
 *
 * Design §4 establishes uniform card backs so face-down play works: a concealed
 * hand, face-down servers, the Claw's face-down loader. This module is the one
 * place that decides what each seat may see.
 *
 * Pure: returns a redacted copy, never mutates G.
 *
 * KNOWN GAP (UI, not engine): boardgame.io calls this with `playerID === null`
 * for a local spectator client, and the current local hotseat client runs as
 * player '0'. So hotseat does not yet physically hide the Entropy player's
 * information behind a pass-device screen. The redaction is wired and correct;
 * closing the gap needs a handoff overlay (tcggg's L5R has one) or real
 * multiplayer.
 */
import { ENTROPY_SEAT, OPERATOR_SEAT } from './constants'
import type { MCState } from './types'

/** Placeholder id substituted for a card the viewer may not see. */
export const HIDDEN = 'HIDDEN'

const mask = (cards: string[]): string[] => cards.map(() => HIDDEN)

/**
 * boardgame.io `playerView`. Returns what `playerID` is allowed to see.
 *
 * Note the *counts* stay accurate — only identities are masked — so both seats
 * can reason about hand size, deck depth, and stack height.
 */
export function playerView(G: MCState, playerID: string | null): MCState {
  // Spectator / local client: no redaction (see the KNOWN GAP above).
  if (playerID === null) return G

  const view: MCState = { ...G }

  if (playerID === OPERATOR_SEAT) {
    // The Operator cannot see what Entropy holds in reserve, nor the order of
    // objectives still to come.
    view.entropyDeck = mask(G.entropyDeck)
    view.entropyStack = mask(G.entropyStack)
    view.evalDeck = mask(G.evalDeck)
    view.featuresDeck = mask(G.featuresDeck)
    view.operatorDeck = mask(G.operatorDeck)
  }

  if (playerID === ENTROPY_SEAT) {
    // Entropy cannot see the Operator's hand, deck order, the face-down Claw
    // loader, or what is under each server (the substrate is the hidden attack
    // surface — design §4).
    view.operatorHand = mask(G.operatorHand)
    view.operatorDeck = mask(G.operatorDeck)
    view.clawPile = mask(G.clawPile)
    view.clawHand = mask(G.clawHand)
    view.evalDeck = mask(G.evalDeck)
    view.featuresDeck = mask(G.featuresDeck)
    view.servers = G.servers.map((s) => ({ ...s, substrateCardId: HIDDEN }))
  }

  return view
}
