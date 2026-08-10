/**
 * Entropy resolution — the three wrench vectors of design §5.
 *
 * | Vector      | What it does                                          |
 * |-------------|-------------------------------------------------------|
 * | Pollution   | Inject junk so the Context no longer matches the eval  |
 * | Subversion  | Corrupt info already in the Context; blank a card      |
 * | Goal-hijack | Swap the objective the Operator is scored against      |
 *
 * The DSL kinds are the deliverable here; the specific numbers on each card are
 * placeholder (see cards/testSet.ts). All targeting semantics are BEST-GUESS —
 * §5 names the vectors but specifies no targeting rules.
 */
import type { MCState } from '../types'
import type { EntropyEffect } from '../cards/types'
import { getEntropyCard, getOperatorCard } from '../cards/registry'
import { feedEntropy, log } from './playHelpers'

/** A target the Entropy player (or the solo auto-resolver) may choose. */
export interface EntropyTarget {
  kind: 'contextSlot' | 'server'
  /** Chain index for contextSlot; unused for server. */
  chainIx?: number
  /** Slot index within the chain, or index into G.servers. */
  index: number
  /** Display label for the overlay. */
  label: string
}

/** Does this effect need the Entropy seat to pick something? */
export function isTargeted(effect: EntropyEffect): boolean {
  return effect.kind === 'subvert' || effect.kind === 'attackServer'
}

/**
 * Legal targets for a targeted effect, in a deterministic order.
 *
 * The ordering matters: solo mode auto-selects the FIRST entry (BEST-GUESS(Q8)
 * — "leftmost eligible"), so this must be stable for replay reproducibility.
 */
export function eligibleTargets(G: MCState, effect: EntropyEffect): EntropyTarget[] {
  const targets: EntropyTarget[] = []

  if (effect.kind === 'subvert') {
    G.contexts.forEach((chain, chainIx) => {
      chain.slots.forEach((slot, index) => {
        if (slot.subverted) return
        targets.push({
          kind: 'contextSlot',
          chainIx,
          index,
          label: getOperatorCard(slot.cardId).name,
        })
      })
    })
  }

  if (effect.kind === 'attackServer') {
    G.servers.forEach((server, index) => {
      if (server.disabled) return
      targets.push({
        kind: 'server',
        index,
        label: getOperatorCard(server.traitCardId).name,
      })
    })
  }

  return targets
}

/**
 * Apply an Entropy effect. Targeted effects require `target`; callers get it
 * from the pendingEntropyTarget gate (hotseat) or from eligibleTargets()[0]
 * (solo auto-resolve).
 *
 * `randomIndex` supplies bounded randomness (bg.io ctx.random) for the effects
 * that need it, so replays stay reproducible.
 */
export function applyEntropyEffect(
  G: MCState,
  effect: EntropyEffect,
  target: EntropyTarget | null,
  randomIndex: (upperBound: number) => number,
): void {
  switch (effect.kind) {
    case 'none':
      log(G, 'Entropy fizzles.')
      break

    // ── POLLUTION ────────────────────────────────────────────────────────
    case 'pollute':
      G.injectedContributions.push(...effect.junk)
      log(G, `polluted the Context with ${effect.junk.length} junk contribution(s)`)
      break

    // ── SUBVERSION ───────────────────────────────────────────────────────
    case 'subvert': {
      if (!target || target.kind !== 'contextSlot' || target.chainIx === undefined) {
        log(G, 'Subvert had no legal target.')
        break
      }
      const slot = G.contexts[target.chainIx]?.slots[target.index]
      if (!slot) {
        log(G, 'Subvert target vanished.')
        break
      }
      slot.subverted = true
      log(G, `subverted ${target.label} — its contributions are blanked`)
      break
    }

    case 'ecosystemTax': {
      // Targeted-entropy event (design §4): hits a whole vendor group at once.
      let hit = 0
      for (const chain of G.contexts) {
        for (const slot of chain.slots) {
          if (slot.subverted) continue
          if (getOperatorCard(slot.cardId).ecosystem === effect.ecosystem) {
            slot.subverted = true
            hit++
          }
        }
      }
      log(G, `${effect.ecosystem} cards taxed — ${hit} subverted`)
      break
    }

    case 'attackServer': {
      if (!target || target.kind !== 'server') {
        log(G, 'Server attack had no legal target.')
        break
      }
      const server = G.servers[target.index]
      if (!server) {
        log(G, 'Server attack target vanished.')
        break
      }
      // Substrate and capability both fall out of play.
      G.operatorDiscard.push(server.substrateCardId, server.traitCardId)
      G.servers.splice(target.index, 1)
      log(G, `destroyed the server hosting ${target.label}`)
      break
    }

    // ── GOAL-HIJACK ──────────────────────────────────────────────────────
    case 'hijack': {
      // BEST-GUESS(Q14): minimal open swap — the objective is exchanged for the
      // next Eval card. The hidden true-objective layer the design flags as the
      // "signature mechanic" is deferred (it needs a hidden-information design
      // pass the doc hasn't had).
      const next = G.evalDeck.shift()
      if (next === undefined) {
        log(G, 'Hijack failed — no objectives left to swap to.')
        break
      }
      const old = G.currentEvalId
      G.currentEvalId = next
      if (old) G.evalDeck.push(old)
      log(G, 'the objective was hijacked — you are scored against something else now')
      break
    }

    // ── Supporting effects ───────────────────────────────────────────────
    case 'discardRandomFromHand': {
      if (G.operatorHand.length === 0) {
        log(G, 'Nothing in hand to discard.')
        break
      }
      const ix = randomIndex(G.operatorHand.length)
      const [discarded] = G.operatorHand.splice(ix, 1)
      if (discarded) {
        G.operatorDiscard.push(discarded)
        log(G, `Operator discarded ${getOperatorCard(discarded).name} at random`)
      }
      break
    }

    case 'feedExtra':
      // Grows the stack mid-resolution; LIFO keeps popping, so these resolve
      // later in the same phase.
      feedEntropy(G, effect.n, 'cascading failure')
      break
  }
}

/** Label for the pending-gate payload, so the overlay can describe the choice. */
export function describeEntropyCard(cardId: string): string {
  return getEntropyCard(cardId).name
}
