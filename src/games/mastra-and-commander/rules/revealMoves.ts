/**
 * Reveal-phase moves — selecting Features.
 *
 * Design §4 ("Features — Mastra's feature deck"): Feature cards have no Entropy
 * cost and each adds a new play pattern; the eval's difficulty sets how many
 * may be selected (generally 1–3).
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { OPERATOR_SEAT } from '../constants'
import type { MCState } from '../types'
import { getFeatureCard } from '../cards/registry'
import { draw, log } from './playHelpers'
import type { MoveCtx } from './playMoves'

function canPick(G: MCState, playerID?: string | null): boolean {
  if (G.matchWinner) return false
  if (G.phase !== 'reveal') return false
  if (playerID != null && playerID !== OPERATOR_SEAT) return false
  return G.pendingFeaturePicks !== null
}

/** Select one Feature from the revealed offer. Free — no Entropy (locked). */
export function pickFeature({ G, playerID }: MoveCtx, cardId: string) {
  if (!canPick(G, playerID)) return INVALID_MOVE
  const gate = G.pendingFeaturePicks
  if (!gate) return INVALID_MOVE

  const offerIx = G.featureOffer.indexOf(cardId)
  if (offerIx < 0) return INVALID_MOVE

  G.featureOffer.splice(offerIx, 1)
  G.activeFeatureIds.push(cardId)

  const def = getFeatureCard(cardId)
  log(G, `feature selected: ${def.name}`)

  switch (def.effect.kind) {
    case 'drawNow':
      draw(G, def.effect.n, def.name)
      break
    case 'grantPip':
      G.roundPool[def.effect.pip] += 1
      log(G, `gained ${def.effect.pip} from ${def.name}`)
      break
    case 'ignoreFirstFeed':
      G.ignoreNextFeed = true
      break
  }

  gate.remaining -= 1
  if (gate.remaining <= 0) G.pendingFeaturePicks = null
}

/** Decline the remaining picks (they are an option, not an obligation). */
export function skipFeaturePicks({ G, playerID }: MoveCtx) {
  if (!canPick(G, playerID)) return INVALID_MOVE
  G.pendingFeaturePicks = null
  log(G, 'declined remaining feature picks')
}
