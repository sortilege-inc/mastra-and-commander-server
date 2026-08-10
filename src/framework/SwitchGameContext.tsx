/**
 * Lets a per-game Board call back to the framework to return to the
 * GameSelect picker.
 *
 * Why a context: boardgame.io's `Client(...)` wraps the Board and only
 * forwards BoardProps from its internal state. Extra props injected by
 * the framework would not flow through cleanly. A context sidesteps that.
 */
import * as React from 'react'

const SwitchGameContext = React.createContext<() => void>(() => {
  // Default: log a warning if someone tries to switch without a provider.
  // eslint-disable-next-line no-console
  console.warn('useSwitchGame called outside a SwitchGameProvider')
})

export const SwitchGameProvider = SwitchGameContext.Provider

export function useSwitchGame(): () => void {
  return React.useContext(SwitchGameContext)
}
