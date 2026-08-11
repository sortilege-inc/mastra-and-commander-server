/**
 * The registry's auto-start contract.
 *
 * The site drops visitors straight into a game, so the choice this returns has
 * to be one the app shell can actually mount: a registered game and a format
 * that game really declares. A stale id here would strand every first-time
 * visitor on a blank screen.
 */
import { describe, expect, it } from 'vitest'
import { autoStartChoice, findGame, listGames } from './registry'

describe('autoStartChoice', () => {
  it('names a registered game', () => {
    const choice = autoStartChoice()
    expect(choice).not.toBeNull()
    expect(findGame(choice!.gameId)).toBeDefined()
  })

  it('names a format that game actually declares', () => {
    const choice = autoStartChoice()!
    const game = findGame(choice.gameId)!
    expect(game.formats.map((f) => f.id)).toContain(choice.formatId)
  })

  it('does not pick a coming-soon format', () => {
    const choice = autoStartChoice()!
    const game = findGame(choice.gameId)!
    const format = game.formats.find((f) => f.id === choice.formatId)!
    // Only tolerated if the game has nothing else to offer.
    if (game.formats.some((f) => !f.comingSoon)) {
      expect(format.comingSoon).toBeFalsy()
    }
  })

  it('starts Mastra & Commander in hotseat', () => {
    const choice = autoStartChoice()!
    expect(choice.gameId).toBe('mastra-and-commander')
    expect(choice.mode).toBe('hotseat')
  })

  it('leaves the other games reachable through the picker', () => {
    // Auto-start is a default, not a lock-in — the Board's "Switch game" link
    // is useless if the registry only knows one game.
    expect(listGames().length).toBeGreaterThan(1)
  })
})
