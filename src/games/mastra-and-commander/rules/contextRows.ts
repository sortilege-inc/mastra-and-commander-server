/**
 * Context rows — owned by Agent tokens.
 *
 * The Context is not one chain but a TREE of rows (owner ruling, 2026-08-13).
 * An Agent token owns each row: the round opens with one, free via Mastra, and
 * every further Agent put into play opens a CHILD row of the row it came from.
 * Cards are then played into a row. Rows nest, but nothing about the nesting
 * changes scoring — the eval reads every row's contributions together.
 *
 * This replaces the older "Processes + Subagent sub-contexts" split: there is
 * one kind of row now, and "subagent" just means an Agent opened while another
 * row already existed.
 */
import { AGENT_TOKEN_ID, DEFAULT_CONTEXT_CEILING } from '../constants'
import type { MCState } from '../types'
import { getEntropyCard } from '../cards/registry'
import { log } from './playHelpers'

/**
 * The ceiling every row uses, after live threats take their bite.
 *
 * Token Limiter is Ongoing: "maximum context per agent is reduced by 1" applies
 * to EVERY row, parent and child alike (owner ruling), so it is computed from
 * the threat row rather than stored per chain.
 */
export function contextCeiling(G: MCState, base = DEFAULT_CONTEXT_CEILING): number {
  let ceiling = base
  for (const threat of G.threats) {
    const effect = getEntropyCard(threat.cardId).effect
    if (effect.kind === 'ongoing' && effect.ongoing.kind === 'ceilingReduction') {
      ceiling -= effect.ongoing.n
    }
  }
  // A row always holds at least one card, or the game deadlocks.
  return Math.max(1, ceiling)
}

/**
 * Put an Agent token into play, opening the row it owns.
 *
 * @param parentIx the row this Agent was spawned from, or null for the round's
 *                 opening Agent (which has no parent).
 * @returns the new row's index.
 */
export function openContext(
  G: MCState,
  parentIx: number | null,
  ceiling: number,
  why: string,
): number {
  G.contexts.push({
    slots: [],
    closed: false,
    ceiling,
    parentChainIx: parentIx,
    ownerCardId: AGENT_TOKEN_ID,
  })
  const ix = G.contexts.length - 1
  log(G, parentIx === null
    ? `Agent opened context row ${ix + 1} — ${why}`
    : `Agent opened context row ${ix + 1}, a subagent of row ${parentIx + 1} — ${why}`)
  return ix
}

/** Re-apply the current ceiling to every row (after a threat lands or leaves). */
export function refreshCeilings(G: MCState, base = DEFAULT_CONTEXT_CEILING): void {
  const ceiling = contextCeiling(G, base)
  for (const chain of G.contexts) chain.ceiling = ceiling
}
