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
 * The locked rules it implements (design §4 "Resources & the pitch economy"):
 *  - A card's cost is paid FIRST by the previous card's output currencies.
 *  - Any shortfall is covered by pitching cards — ONE matching card per unmet
 *    pip, where the pitched card's own cost must share that type.
 *  - You draw one card for every card pitched. (Caller's job — see executePitches.)
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
import { EMPTY_PIPS } from '../constants'
import type { OperatorCardDef } from '../cards/types'

/** Pools a payment may draw on, in priority order (outputs before pool). */
export interface PaymentSources {
  /** The previous card's unspent outputs. Spent first (design §4). */
  prevOutputs: PipCounts
  /** Free resources granted this round by equipment / model / servers / features. */
  roundPool: PipCounts
}

/** How many units each source contributed, so the caller can decrement exactly
 *  what was spent without re-deriving the algorithm. */
export interface PaymentPlan {
  fromPrevOutputs: PipCounts
  fromRoundPool: PipCounts
  /** Pitched card ids, in the order they were assigned to unmet pips. */
  pitches: string[]
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

/** True if a card can be pitched to cover a pip of this type. Locked rule:
 *  "each pitched card's own cost must share that type". Generic pips accept
 *  any card. */
export function canPitchFor(def: OperatorCardDef, pip: Pip): boolean {
  if (pip === 'generic') return true
  return def.consume.includes(pip)
}

/**
 * Plan how to pay `cost`, drawing on `sources` and pitching `pitchDefs`.
 *
 * Returns a plan, or a reason it cannot be paid. Does NOT mutate anything —
 * the caller applies the plan (see applyPlanToSources) and handles the
 * draw-per-pitch and entropy-feed side effects.
 *
 * @param discount generic pips waived (ecosystem discount); clamped to the
 *                 number of generic pips actually in the cost.
 */
export function planPayment(
  cost: Pip[],
  sources: PaymentSources,
  pitchDefs: OperatorCardDef[],
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

  // Assign pitches to pips. Typed pips are the constrained ones, so satisfy
  // them first; generic pips accept anything left over. With ≤5 pips and a
  // strict "typed first" ordering this greedy assignment is exact.
  const available = pitchDefs.map((def, ix) => ({ def, ix, used: false }))
  const pitches: string[] = []
  const typedFirst = [...unmet].sort((a, b) => (a === 'generic' ? 1 : 0) - (b === 'generic' ? 1 : 0))

  for (const pip of typedFirst) {
    const match = available.find((entry) => !entry.used && canPitchFor(entry.def, pip))
    if (!match) {
      return { ok: false, reason: `No pitched card can pay a ${pip} pip` }
    }
    match.used = true
    pitches.push(match.def.id)
  }

  return { ok: true, plan: { fromPrevOutputs, fromRoundPool, pitches, discounted } }
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
