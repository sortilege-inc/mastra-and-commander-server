/** Per-game entry point — register Mastra & Commander with the framework. */
import type { GameRegistration } from '../../framework/types'
import { MastraCommander, type MCState } from './Game'
import { Board } from './Board'

export const mastraCommanderRegistration: GameRegistration<MCState> = {
  id: 'mastra-and-commander',
  name: 'Mastra & Commander',
  documentTitle: 'Mastra & Commander',
  tagline: 'Asymmetric alignment duel — Operator vs. Entropy around an Eval.',
  numPlayers: 2,
  game: MastraCommander,
  board: Board,
  formats: [
    {
      id: 'first-pass',
      name: 'First pass',
      description:
        'The full round loop with placeholder cards. Many rules are best-guess '
        + 'first passes pending design sign-off — see the README.',
    },
  ],
  // No applyDeckExport/preloadDeck yet: decks are built from the synthetic test
  // set in setup(), so the framework skips the deck-import flow entirely.
}
