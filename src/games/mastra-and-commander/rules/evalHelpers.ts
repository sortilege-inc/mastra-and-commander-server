/**
 * Eval scoring — the poker-hand matcher and the success ladder.
 *
 * Design §4 ("Contribution & the Eval"): each card shows a Contribution
 * (Color + Shape) at its bottom; the Eval is a poker-hand-style pattern over
 * the contributions of the cards in the resolved Context. Design §4 outcomes:
 * superior / best / lesser / failure.
 *
 * Pure functions — `contributionsOf` reads state but never mutates it.
 */
import { SHAPES } from '../constants'
import type { Color, Contribution, Shape } from '../constants'
import type { EvalTier, MCState } from '../types'
import type { EvalCardDef, EvalPattern } from '../cards/types'
import { getOperatorCard } from '../cards/registry'

/**
 * Everything scored against the objective:
 *  - every non-subverted Context slot's contributions, across ALL chains
 *    (a closed Process still scores — design §4: it "closes out with or
 *    without your results"),
 *  - the RAG track's locked contribution, if the track is complete,
 *  - junk injected by Pollute wrenches (design §5).
 */
export function contributionsOf(G: MCState): Contribution[] {
  const out: Contribution[] = []
  for (const chain of G.contexts) {
    for (const slot of chain.slots) {
      if (slot.subverted) continue
      out.push(...getOperatorCard(slot.cardId).contributes)
    }
  }
  if (G.ragLockedContribution) out.push(G.ragLockedContribution)
  out.push(...G.injectedContributions)
  return out
}

/** How many cards are in the Context — compared against the eval's par. */
export function contextSize(G: MCState): number {
  return G.contexts.reduce((n, chain) => n + chain.slots.length, 0)
}

const countBy = <K extends string>(items: K[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1
  return counts
}

/** Does a single pattern hold over these contributions? */
export function matchPattern(contribs: Contribution[], pattern: EvalPattern): boolean {
  const colors = contribs.map((x) => x.color)
  const shapes = contribs.map((x) => x.shape)

  switch (pattern.kind) {
    case 'countOfColor': {
      const counts = countBy<Color>(colors)
      if (pattern.color) return (counts[pattern.color] ?? 0) >= pattern.n
      // No color named — any single color reaching n.
      return Object.values(counts).some((n) => n >= pattern.n)
    }

    case 'noColor':
      return !colors.includes(pattern.color)

    case 'runOfShapes': {
      // Consecutive in SHAPES order. Presence counts, not multiplicity.
      const present = new Set(shapes)
      let best = 0
      let run = 0
      for (const shape of SHAPES) {
        run = present.has(shape) ? run + 1 : 0
        if (run > best) best = run
      }
      return best >= pattern.len
    }

    case 'fullHouse': {
      const counts = Object.values(countBy<Color>(colors)).sort((a, b) => b - a)
      return (counts[0] ?? 0) >= 3 && (counts[1] ?? 0) >= 2
    }

    case 'nOfAShape': {
      const counts = countBy<Shape>(shapes)
      return Object.values(counts).some((n) => n >= pattern.n)
    }

    case 'countAny':
      return contribs.length >= pattern.n

    case 'shapeAtLeast': {
      const counts = countBy<Shape>(shapes)
      return (counts[pattern.shape] ?? 0) >= pattern.n
    }
  }
}

/** An eval passes only when ALL its patterns hold. */
export function matchEval(contribs: Contribution[], def: EvalCardDef): boolean {
  return def.patterns.every((pattern) => matchPattern(contribs, pattern))
}

/**
 * Place a result on the success ladder (design §4 "Outcomes").
 *
 * BEST-GUESS: the doc says scoring is par-based and names four bands but does
 * not define the band boundaries. We read them as:
 *   pass within superiorAt → superior · pass within par → best ·
 *   pass over par ("passed sloppily") → lesser · no pass → failure.
 */
export function scoreTier(
  contribs: Contribution[],
  size: number,
  def: EvalCardDef,
): EvalTier {
  if (!matchEval(contribs, def)) return 'failure'
  if (def.superiorAt !== undefined && size <= def.superiorAt) return 'superior'
  if (size <= def.par) return 'best'
  return 'lesser'
}

/** Did this tier count as passing the eval? (`lesser` is a sloppy pass, not a
 *  loss — design §4: loss is "failing to match the eval".) */
export const isPass = (tier: EvalTier): boolean => tier !== 'failure'
