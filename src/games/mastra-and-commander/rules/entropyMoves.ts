/**
 * Entropy-phase moves (design §2 step 3): resolve the accumulated Entropy in
 * reverse order (LIFO). The Operator draws one card per Entropy resolved.
 *
 * Seat handling: `resolveNextEntropy` and `chooseEntropyTarget` belong to the
 * Entropy seat in hotseat play. In solo (design §3: the Entropy deck "runs
 * itself"), the Board auto-dispatches them — the engine itself is mode-agnostic,
 * so both paths use the same moves.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import { ENTROPY_SEAT } from '../constants'
import type { MCState } from '../types'
import { getEntropyCard } from '../cards/registry'
import { applyEntropyEffect, eligibleTargets, isTargeted } from './entropyHelpers'
import type { EntropyTarget } from './entropyHelpers'
import { draw, log } from './playHelpers'
import type { MoveCtx } from './playMoves'

/** Either seat may drive Entropy resolution: the Entropy player in hotseat, and
 *  the Operator's client acting as the scripted deck in solo. */
function canDriveEntropy(G: MCState, playerID?: string | null): boolean {
  if (G.matchWinner) return false
  if (G.phase !== 'entropy') return false
  void playerID // both seats permitted; see module header
  return true
}

/** Bounded random index helper backed by bg.io's random plugin. */
function randomIndexFrom(random: MoveCtx['random']): (upperBound: number) => number {
  return (upperBound: number) => (random ? random.Die(upperBound) - 1 : 0)
}

/**
 * Pop and resolve the top of the Entropy stack. If the effect needs a target,
 * opens the `pendingEntropyTarget` gate instead of resolving immediately.
 */
export function resolveNextEntropy({ G, playerID, random }: MoveCtx) {
  if (!canDriveEntropy(G, playerID)) return INVALID_MOVE
  if (G.pendingEntropyTarget) return INVALID_MOVE
  if (G.entropyStack.length === 0) return INVALID_MOVE

  // LIFO — the end of the array is the top of the stack.
  const cardId = G.entropyStack.pop()
  if (cardId === undefined) return INVALID_MOVE

  const def = getEntropyCard(cardId)
  log(G, `resolving ${def.name}`)

  if (isTargeted(def.effect)) {
    const targets = eligibleTargets(G, def.effect)
    if (targets.length > 0) {
      G.pendingEntropyTarget = { entropyCardId: cardId, effectKind: def.effect.kind }
      // The card is held by the gate; it lands in `entropyResolved` when the
      // target is chosen.
      return
    }
    log(G, `${def.name} had no legal target — fizzles`)
  } else {
    applyEntropyEffect(G, def.effect, null, randomIndexFrom(random))
  }

  G.entropyResolved.push(cardId)
  // Locked (design §2): "The Operator draws one card per Entropy resolved."
  draw(G, 1, 'Entropy resolved')
}

/** Resolve the open targeting gate with an explicit choice (hotseat). */
export function chooseEntropyTarget({ G, playerID, random }: MoveCtx, target: EntropyTarget) {
  if (G.phase !== 'entropy' || G.matchWinner) return INVALID_MOVE
  if (playerID != null && playerID !== ENTROPY_SEAT) return INVALID_MOVE
  const gate = G.pendingEntropyTarget
  if (!gate) return INVALID_MOVE

  const def = getEntropyCard(gate.entropyCardId)
  const legal = eligibleTargets(G, def.effect)
  const chosen = legal.find(
    (t) => t.kind === target.kind && t.index === target.index && t.chainIx === target.chainIx,
  )
  if (!chosen) return INVALID_MOVE

  applyEntropyEffect(G, def.effect, chosen, randomIndexFrom(random))
  G.pendingEntropyTarget = null
  G.entropyResolved.push(gate.entropyCardId)
  draw(G, 1, 'Entropy resolved')
}

/**
 * Resolve the open targeting gate automatically.
 *
 * BEST-GUESS(Q8): the deterministic rule is "leftmost eligible" — the first
 * entry of eligibleTargets(), whose ordering is stable. Used by solo play and
 * available as a convenience in hotseat.
 */
export function autoResolveEntropyTarget({ G, playerID, random }: MoveCtx) {
  if (!canDriveEntropy(G, playerID)) return INVALID_MOVE
  const gate = G.pendingEntropyTarget
  if (!gate) return INVALID_MOVE

  const def = getEntropyCard(gate.entropyCardId)
  const targets = eligibleTargets(G, def.effect)
  const chosen = targets[0] ?? null

  applyEntropyEffect(G, def.effect, chosen, randomIndexFrom(random))
  G.pendingEntropyTarget = null
  G.entropyResolved.push(gate.entropyCardId)
  draw(G, 1, 'Entropy resolved')
}
