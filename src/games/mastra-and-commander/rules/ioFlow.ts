/**
 * ★ THE PROVISIONAL-I/O QUARANTINE ★
 *
 * This module is the ONLY place in the engine that knows what consume/produce
 * and pitching mean. Everything else calls `planPayment` / `applyPlanToSources`
 * and never reasons about pips itself.
 *
 * Why the isolation: the design doc flags the consume/produce flow as
 * explicitly PROVISIONAL — "the owner isn't happy with the consume/produce
 * pattern yet — expect this to change through playtesting" (§4 Context, and
 * open question 🟨19). When it changes, this file and its test change; the
 * moves, the board, and the state shape should not have to.
 *
 * The rules it implements (design §4 "Resources & the pitch economy"):
 *  - A card's cost is paid FIRST by the previous card's output currencies.
 *  - Any shortfall is covered by pitching cards — ONE card per unmet pip.
 *  - The hand is refilled afterwards. (Caller's job — see executePitches.)
 *
 * Owner ruling (2026-08-10): ANY card may be pitched for ANY pip — the pitched
 * card's cost no longer has to share a type. What a pitch costs is Entropy, and
 * that price is set by how closely the pitched card's CONTRIBUTION matches the
 * contribution of the card being paid for (see pitchEntropyFor). So this module
 * no longer rejects a pitch on type grounds; it only checks the count.
 *
 * BEST-GUESS(Q2 / 🟨19) — the payment matrix, which the doc does not specify:
 *  - A typed output unit pays a cost pip of the SAME type, or a `generic` pip.
 *  - A `generic` output unit pays only a `generic` cost pip.
 *  - Any card may be pitched for a `generic` pip; a typed pip needs a pitch card
 *    whose own `consume` contains that currency ("shares that type" — locked).
 *
 * Everything here is PURE: no G, no mutation of inputs, no randomness.
 */
import type { Currency, Pip, PipCounts } from '../constants'
import { EMPTY_PIPS, PITCH_ENTROPY } from '../constants'
import type { OperatorCardDef } from '../cards/types'

/** Pools a payment may draw on, in priority order (outputs before pool). */
export interface PaymentSources {
  /** The previous card's unspent outputs. Spent first (design §4). */
  prevOutputs: PipCounts
  /** Free resources granted this round by equipment / model / servers / features. */
  roundPool: PipCounts
}

/** One pitched card and what it cost in Entropy. */
export interface PitchAssignment {
  cardId: string
  /** Entropy this pitch feeds — set by contribution match (PITCH_ENTROPY). */
  entropy: number
  /** How the match was classified, for the log and the UI. */
  match: 'exact' | 'partial' | 'none'
}

/** How many units each source contributed, so the caller can decrement exactly
 *  what was spent without re-deriving the algorithm. */
export interface PaymentPlan {
  fromPrevOutputs: PipCounts
  fromRoundPool: PipCounts
  /** Pitched cards, in the order they were assigned to unmet pips. */
  pitches: PitchAssignment[]
  /** Generic pips waived by the ecosystem discount. */
  discounted: number
}

export type PaymentResult =
  | { ok: true; plan: PaymentPlan }
  | { ok: false; reason: string }

export const zeroPips = (): PipCounts => ({ ...EMPTY_PIPS })

/** Count a pip list into a PipCounts record. */
export function toPipCounts(pips: Pip[]): PipCounts {
  const counts = zeroPips()
  for (const pip of pips) counts[pip] += 1
  return counts
}

export const totalPips = (counts: PipCounts): number =>
  counts.capital + counts.attention + counts.technology + counts.generic

/**
 * Plan how to pay `cost`, drawing on `sources` and pitching `pitchDefs`.
 *
 * Returns a plan, or a reason it cannot be paid. Does NOT mutate anything —
 * the caller applies the plan (see applyPlanToSources) and handles the
 * hand refill and Entropy feed.
 *
 * @param payingFor the card being paid for — its Contribution sets what each
 *                  pitch costs in Entropy. Null when there is no card to
 *                  compare against (every pitch then falls to the `none` tier).
 * @param discount  generic pips waived (ecosystem discount); clamped to the
 *                  number of generic pips actually in the cost.
 */
export function planPayment(
  cost: Pip[],
  sources: PaymentSources,
  pitchDefs: OperatorCardDef[],
  payingFor: OperatorCardDef | null = null,
  discount = 0,
): PaymentResult {
  const remaining = toPipCounts(cost)

  // 1. Ecosystem discount waives generic pips (BEST-GUESS(Q6)).
  const discounted = Math.min(Math.max(discount, 0), remaining.generic)
  remaining.generic -= discounted

  const fromPrevOutputs = zeroPips()
  const fromRoundPool = zeroPips()

  // 2. Pay typed pips from same-type units — outputs first, then the pool.
  const TYPED: Currency[] = ['capital', 'attention', 'technology']
  for (const currency of TYPED) {
    for (const [source, tally] of [
      [sources.prevOutputs, fromPrevOutputs],
      [sources.roundPool, fromRoundPool],
    ] as const) {
      const take = Math.min(remaining[currency], source[currency] - tally[currency])
      if (take > 0) {
        tally[currency] += take
        remaining[currency] -= take
      }
    }
  }

  // 3. Pay generic pips from ANY leftover units — typed units may pay generic,
  //    generic units pay only generic (BEST-GUESS payment matrix).
  //    Spend generic units first so typed units stay available for typed pips
  //    (they already had their chance above, so this ordering is safe).
  const GENERIC_ORDER: Pip[] = ['generic', 'capital', 'attention', 'technology']
  for (const pip of GENERIC_ORDER) {
    for (const [source, tally] of [
      [sources.prevOutputs, fromPrevOutputs],
      [sources.roundPool, fromRoundPool],
    ] as const) {
      if (remaining.generic <= 0) break
      const take = Math.min(remaining.generic, source[pip] - tally[pip])
      if (take > 0) {
        tally[pip] += take
        remaining.generic -= take
      }
    }
  }

  // 4. Everything still unmet must be covered by exactly one pitch card each.
  const unmet: Pip[] = []
  for (const pip of ['capital', 'attention', 'technology', 'generic'] as const) {
    for (let i = 0; i < remaining[pip]; i++) unmet.push(pip)
  }

  if (pitchDefs.length !== unmet.length) {
    return {
      ok: false,
      reason: `Needs exactly ${unmet.length} pitch(es) (${unmet.join(', ') || 'none'}), got ${pitchDefs.length}`,
    }
  }

  // Every pitch is legal; price each one by contribution match.
  return {
    ok: true,
    plan: {
      fromPrevOutputs,
      fromRoundPool,
      pitches: pitchDefs.map((def) => pitchEntropyFor(def, payingFor)),
      discounted,
    },
  }
}

/**
 * Price one pitch by how well its Contribution matches the card being paid for
 * (owner ruling, 2026-08-10):
 *
 *   same color AND shape → 1 Entropy
 *   same color OR shape  → 2
 *   neither              → 3
 *
 * Cards can carry up to three contributions, so we take the BEST (cheapest)
 * match across every pitched × target pair — you get credit for your closest
 * resemblance, not your average one.
 *
 * A card with no contributions at all, or a pitch made with no target to
 * compare against, falls to the `none` tier.
 */
export function pitchEntropyFor(
  pitched: OperatorCardDef,
  payingFor: OperatorCardDef | null,
): PitchAssignment {
  let best: 'exact' | 'partial' | 'none' = 'none'

  for (const mine of pitched.contributes) {
    for (const theirs of payingFor?.contributes ?? []) {
      const sameColor = mine.color === theirs.color
      const sameShape = mine.shape === theirs.shape
      if (sameColor && sameShape) {
        best = 'exact'
        break
      }
      if (sameColor || sameShape) best = 'partial'
    }
    if (best === 'exact') break
  }

  return { cardId: pitched.id, entropy: PITCH_ENTROPY[best], match: best }
}

/** Subtract a planned payment from the live source pools. Mutates in place —
 *  callers pass Immer-draft state from a move handler. */
export function applyPlanToSources(
  plan: PaymentPlan,
  prevOutputs: PipCounts | null,
  roundPool: PipCounts,
): void {
  if (prevOutputs) {
    for (const pip of ['capital', 'attention', 'technology', 'generic'] as const) {
      prevOutputs[pip] -= plan.fromPrevOutputs[pip]
    }
  }
  for (const pip of ['capital', 'attention', 'technology', 'generic'] as const) {
    roundPool[pip] -= plan.fromRoundPool[pip]
  }
}

/** A chain's payable outputs = the last slot's unspent produce. An empty chain
 *  has none, so the first card of a chain pays from the pool and pitches only. */
export function chainOutputs(lastSlotOutputs: PipCounts | undefined): PipCounts {
  return lastSlotOutputs ?? zeroPips()
}

/**
 * The slot whose outputs fund the next play.
 *
 * Face-down CALL slots are SKIPPED for produce/consume purposes (owner ruling,
 * 2026-08-10) — they contribute to the eval but sit outside the resource flow,
 * so the chain looks *through* them to the last face-up card.
 */
export function lastPayingSlot<T extends { faceDown: boolean }>(
  slots: T[],
): T | undefined {
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i]!
    if (!slot.faceDown) return slot
  }
  return undefined
}
