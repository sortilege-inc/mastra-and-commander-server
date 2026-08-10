/**
 * Game-mode React context.
 *
 * Threads the player's choice ("hotseat" vs "vs-ai") down through the
 * live game tree so Board / overlays / the AI driver can branch on it.
 *
 * Default value is 'hotseat' so callers that consume the hook from
 * outside the live game (e.g. dev tools, smoke tests) get sensible
 * behaviour instead of crashing.
 *
 * Per docs/ai-opponent-plan.md: the AI driver subscribes to the bg.io
 * client and dispatches the bot's move on its turn. The driver itself
 * doesn't need this context (App.tsx tells it the mode directly), but
 * UI components downstream of the Board do — e.g. the StatusBar wants
 * to render an "AI is thinking…" pill in vs-ai mode but a pass-device
 * hint in hotseat.
 *
 * Per CLAUDE.md: framework code only. No imports from src/games/...
 */
import * as React from 'react'
import type { GameMode } from './storage'

const GameModeContext = React.createContext<GameMode>('hotseat')

interface GameModeProviderProps {
  mode: GameMode
  children: React.ReactNode
}

export function GameModeProvider({
  mode, children,
}: GameModeProviderProps): React.ReactElement {
  return (
    <GameModeContext.Provider value={mode}>
      {children}
    </GameModeContext.Provider>
  )
}

/** Read the current game mode. Defaults to 'hotseat' if no provider is
 *  mounted above the caller. */
export function useGameMode(): GameMode {
  return React.useContext(GameModeContext)
}
