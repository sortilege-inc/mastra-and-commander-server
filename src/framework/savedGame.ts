/**
 * Saved-game envelope — the serializable bundle that round-trips a
 * game-in-progress through a downloadable JSON file.
 *
 * Schema is versioned so future engine changes can introduce a
 * migration step without breaking older saves. The shape is
 * deliberately game-agnostic: the framework owns the envelope, each
 * game module owns the `G` shape it embeds.
 *
 * What's included:
 *   - The merged card catalog (id → record) — what
 *     CardCatalogProvider needs to render names / costs / etc.
 *     We carry this instead of the raw DeckExport array because
 *     the game state already references cards by id; we don't need
 *     deck construction info to resume play.
 *   - The live game state `G` — the bg.io state object. Opaque
 *     from the framework's perspective; each game module knows its
 *     own shape and how to reload it.
 *
 * What's NOT included:
 *   - bg.io's move log (we use G as the snapshot, not a replay).
 *     Reaches game-current-state but not full history. Move log
 *     replay would be a separate feature.
 *   - User preferences (move-log filter, silenced reactions) — those
 *     live in localStorage and are unrelated to a specific game.
 *
 * Privacy: hand contents land in G unredacted. Today this is fine
 * (solo + hotseat); a networked multiplayer load would need a redact
 * step before persisting state from one player's perspective.
 */
import type { DeckExport } from './types'

export const SAVED_GAME_VERSION = 1

export interface SavedGame {
  savedGameVersion: typeof SAVED_GAME_VERSION
  /** ISO timestamp when the file was saved. Not authoritative for
   *  game logic; just nice to have in a file-picker tooltip. */
  exportedAt: string
  /** Game registration id (e.g. 'l5r-lcg'). Used to route to the
   *  right registration on load. */
  gameId: string
  /** Optional format id. If absent, the registration's first format
   *  is assumed. */
  formatId?: string
  /** Merged card catalog: id → record. Replaces the union of the
   *  DeckExport envelopes for runtime purposes. */
  catalog: Record<string, Record<string, unknown>>
  /** The live bg.io G state. Opaque to the framework. */
  G: unknown
}

/**
 * Build a SavedGame from the runtime catalog + live G. The catalog
 * is typically supplied by the CardCatalogContext; G comes from the
 * bg.io Board prop.
 */
export function buildSavedGame(args: {
  gameId: string
  formatId?: string
  catalog: Record<string, Record<string, unknown>>
  G: unknown
  /** Override exportedAt for deterministic testing. */
  exportedAt?: string
}): SavedGame {
  return {
    savedGameVersion: SAVED_GAME_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    gameId: args.gameId,
    formatId: args.formatId,
    catalog: args.catalog,
    G: args.G,
  }
}

/**
 * Serialize a SavedGame to a JSON string. Pretty-printed at 2 spaces
 * so the file is human-inspectable.
 */
export function serializeSavedGame(saved: SavedGame): string {
  return JSON.stringify(saved, null, 2)
}

/**
 * Parse + validate a JSON string into a SavedGame. Throws with a
 * specific error message if the shape doesn't match — callers should
 * surface the message to the user.
 */
export function parseSavedGame(text: string): SavedGame {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Top-level value is not an object.')
  }
  const r = raw as Record<string, unknown>
  if (r.savedGameVersion !== SAVED_GAME_VERSION) {
    throw new Error(
      `savedGameVersion is "${String(r.savedGameVersion)}"; this build only ` +
      `understands version ${SAVED_GAME_VERSION}. (Migration: not implemented; ` +
      `regenerate the save from a newer build, or hand-edit the version field if ` +
      `you know the schema is compatible.)`
    )
  }
  if (typeof r.gameId !== 'string' || r.gameId.length === 0) {
    throw new Error('gameId missing or empty.')
  }
  if (typeof r.exportedAt !== 'string') {
    throw new Error('exportedAt missing or not a string.')
  }
  if (typeof r.catalog !== 'object' || r.catalog === null) {
    throw new Error('catalog missing or not an object.')
  }
  if (r.G === undefined || r.G === null) {
    throw new Error('G (game state) missing.')
  }
  return {
    savedGameVersion: SAVED_GAME_VERSION,
    exportedAt: r.exportedAt,
    gameId: r.gameId,
    formatId: typeof r.formatId === 'string' ? r.formatId : undefined,
    catalog: r.catalog as Record<string, Record<string, unknown>>,
    G: r.G,
  }
}

/**
 * Trigger a JSON-file download in the browser. The filename embeds
 * the game id + timestamp so the user can keep multiple saves
 * straight without renaming.
 */
export function downloadSavedGame(saved: SavedGame): void {
  const text = serializeSavedGame(saved)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = saved.exportedAt.replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19)
  const filename = `${saved.gameId}-save-${stamp}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Firefox actually fires the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * For Vite SSR / non-DOM contexts, expose the catalog-from-envelopes
 * merger so the App can compute the same shape it would serialize.
 */
export function mergeEnvelopeCatalogs(envelopes: DeckExport[]): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {}
  for (const env of envelopes) {
    for (const [id, rec] of Object.entries(env.cards)) merged[id] = rec
  }
  return merged
}
