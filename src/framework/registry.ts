/**
 * Game registry — the framework's index of available games.
 *
 * Each per-game module under `src/games/<game-id>/` exports a
 * GameRegistration; the registry imports them and exposes lookups by id.
 * This is the ONE place in the framework allowed to import from
 * `src/games/...` (and only via these top-level entry points).
 */
import type { GameRegistration } from './types'
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
