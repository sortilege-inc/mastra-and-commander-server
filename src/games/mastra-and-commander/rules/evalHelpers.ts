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
import type { ContextSlot, EvalTier, MCState } from '../types'
import type { EvalCardDef, EvalPattern } from '../cards/types'
import { getEvalCard, getOperatorCard } from '../cards/registry'
import { threatBlanksProducersOf } from './entropyHelpers'

/**
 * What one Context slot contributes.
 *
 * A face-up card contributes its own printed Contribution. A face-down CALL
 * slot contributes whatever the resource it invoked would — the installed
 * Tool's, the attached Skill's, or RAG's payload. That indirection is the whole
 * point of installing: the Entropy was paid once, and every later call is free
 * (owner ruling, 2026-08-10).
 */
export function slotContributions(G: MCState, slot: ContextSlot): Contribution[] {
  if (slot.subverted) return []

  // A live Ongoing threat can blank a whole class of card (PII Leak: "cards
  // that produce attention do not contribute to the current eval").
  if (!slot.faceDown && threatBlanksProducersOf(G, slot.cardId)) return []

  if (slot.calls) {
    switch (slot.calls.kind) {
      case 'server': {
        // A destroyed or disabled server scores nothing — losing the surface
        // is meant to cost you the call.
        const { serverId } = slot.calls
        const server = G.servers.find((entry) => entry.id === serverId)
        if (!server || server.disabled) return []
        return getOperatorCard(server.traitCardId).contributes
      }
      case 'skill': {
        const { loadoutId } = slot.calls
        const attachment = G.skillAttachments.find((a) => a.loadoutId === loadoutId)
        return attachment ? getOperatorCard(attachment.skillCardId).contributes : []
      }
      case 'rag':
        return G.rag.contribution
    }
  }

  return getOperatorCard(slot.cardId).contributes
}

/**
 * Everything scored against the objective:
 *  - every non-subverted Context slot, across ALL chains including Subagent
 *    sub-contexts (a closed Process still scores — design §4: it "closes out
 *    with or without your results"),
 *  - junk injected by Pollute wrenches (design §5).
 *
 * Note RAG and installed Tools/Skills are NOT added here directly — they score
 * only when called by a face-down slot.
 */
export function contributionsOf(G: MCState): Contribution[] {
  const out: Contribution[] = []
  for (const chain of G.contexts) {
    for (const slot of chain.slots) {
      out.push(...slotContributions(G, slot))
    }
  }
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

/**
 * How many printed hand marks two Objectives differ by.
 *
 * Algorithmic Intervention replaces the eval with one "differing by no more
 * than two elements", so the comparison is over the printed hand tokens as a
 * MULTISET: match identical marks off against each other, and everything left
 * on either side counts. Two hands of different length therefore differ by at
 * least that length gap, which is the intuitive reading.
 */
export function handDifference(a: string[], b: string[]): number {
  const remaining = [...b]
  let matched = 0
  for (const token of a) {
    const ix = remaining.indexOf(token)
    if (ix !== -1) {
      remaining.splice(ix, 1)
      matched++
    }
  }
  return (a.length - matched) + (b.length - matched)
}

/**
 * The nearest Objective in the deck within `maxDifference` marks of the current
 * one, or null if none qualifies.
 *
 * Ties break on deck order, which is already shuffled — deterministic for
 * replay without needing the RNG.
 */
export function nearestEval(
  G: MCState,
  maxDifference: number,
): string | null {
  if (!G.currentEvalId) return null
  const current = getEvalCard(G.currentEvalId).hand

  let best: string | null = null
  let bestDiff = Infinity
  for (const id of G.evalDeck) {
    const diff = handDifference(current, getEvalCard(id).hand)
    if (diff <= maxDifference && diff < bestDiff) {
      best = id
      bestDiff = diff
    }
  }
  return best
}
