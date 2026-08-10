/**
 * Validate an arbitrary JSON value against the DeckExport envelope shape
 * documented in CLAUDE.md (`exportVersion: 1`).
 *
 * Returns `{ ok: true, value }` for a clean envelope, or `{ ok: false,
 * error }` with a human-readable message. Game-specific validation
 * (deck size, format rules, etc.) is the registered game's job —
 * this validator only enforces the envelope shape.
 */
import type { DeckExport } from './types'

export type ValidationResult =
  | { ok: true; value: DeckExport }
  | { ok: false; error: string }

export function validateDeckExport(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Expected a JSON object.' }
  }
  const obj = input as Record<string, unknown>

  if (obj.exportVersion !== 1) {
    return { ok: false, error: `Unsupported exportVersion: ${JSON.stringify(obj.exportVersion)}. This version of tcggg understands exportVersion 1.` }
  }

  const deck = obj.deck as Record<string, unknown> | undefined
  if (!deck || typeof deck !== 'object') {
    return { ok: false, error: 'Missing required field: deck (object).' }
  }
  for (const k of ['id', 'gameId', 'formatId', 'name']) {
    if (typeof deck[k] !== 'string' || !(deck[k] as string)) {
      return { ok: false, error: `Missing or invalid deck.${k}.` }
    }
  }
  if (typeof deck.zones !== 'object' || deck.zones === null) {
    return { ok: false, error: 'Missing or invalid deck.zones.' }
  }
  const zones = deck.zones as Record<string, unknown>
  for (const [zoneId, entries] of Object.entries(zones)) {
    if (!Array.isArray(entries)) {
      return { ok: false, error: `deck.zones.${zoneId} must be an array.` }
    }
    for (const e of entries) {
      if (typeof e !== 'object' || e === null) {
        return { ok: false, error: `deck.zones.${zoneId} contains a non-object entry.` }
      }
      const ent = e as Record<string, unknown>
      if (typeof ent.cardId !== 'string' || typeof ent.qty !== 'number') {
        return { ok: false, error: `deck.zones.${zoneId} entries must each be { cardId: string, qty: number }.` }
      }
    }
  }

  const cards = obj.cards as Record<string, unknown> | undefined
  if (!cards || typeof cards !== 'object') {
    return { ok: false, error: 'Missing required field: cards (object).' }
  }
  // Sanity: every cardId referenced by zones must appear in cards. We
  // don't fully validate each card record's shape — that's the game's
  // job — but the cardId presence is a fast cross-check.
  for (const [zoneId, entries] of Object.entries(zones)) {
    for (const e of entries as Array<{ cardId: string }>) {
      if (!(e.cardId in cards)) {
        return { ok: false, error: `deck.zones.${zoneId} references unknown cardId "${e.cardId}" (not in envelope.cards).` }
      }
    }
  }

  return { ok: true, value: obj as unknown as DeckExport }
}
