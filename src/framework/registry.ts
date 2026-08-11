/**
 * Game registry — the framework's index of available games.
 *
 * Each per-game module under `src/games/<game-id>/` exports a
 * GameRegistration; the registry imports them and exposes lookups by id.
 * This is the ONE place in the framework allowed to import from
 * `src/games/...` (and only via these top-level entry points).
 */
import type { GameRegistration } from './types'
import type { GameMode } from './storage'
import { mastraCommanderRegistration } from '../games/mastra-and-commander'
import { ticTacToeRegistration } from '../games/tic-tac-toe'

const GAMES: GameRegistration[] = [
  mastraCommanderRegistration as GameRegistration,
  ticTacToeRegistration as GameRegistration,
]

export function listGames(): GameRegistration[] {
  return GAMES
}

export function findGame(id: string): GameRegistration | undefined {
  return GAMES.find((g) => g.id === id)
}

/**
 * The game a first-time visitor drops straight into, skipping the picker.
 *
 * This deployment IS the Mastra & Commander app, so landing on a game-select
 * screen is friction. Naming a specific game belongs HERE rather than in
 * App.tsx: the registry is the framework's only games-aware module, so the app
 * shell stays game-agnostic (see CLAUDE.md).
 *
 * Set to null to restore "always show the picker".
 */
const AUTO_START_GAME_ID: string | null = 'mastra-and-commander'

/** Mode for the auto-started game: two humans sharing the keyboard. */
const AUTO_START_MODE: GameMode = 'hotseat'

/**
 * The choice to use when a visitor has no stored preference. Returns null if
 * auto-start is off or the named game isn't registered, in which case the
 * caller should fall back to the picker.
 *
 * The format is resolved from the registration rather than hard-coded, so
 * renaming or reordering a game's formats can't strand this on a dead id.
 */
export function autoStartChoice(): {
  gameId: string
  formatId: string
  mode: GameMode
} | null {
  if (!AUTO_START_GAME_ID) return null
  const game = findGame(AUTO_START_GAME_ID)
  if (!game) return null
  const format = game.formats.find((f) => !f.comingSoon) ?? game.formats[0]
  if (!format) return null
  return { gameId: game.id, formatId: format.id, mode: AUTO_START_MODE }
}
