/** Per-game entry point — register Mastra & Commander with the framework.
 *  Currently a scaffold: it models the locked round loop only (see Game.ts).
 *  Formats / decks / real mechanics arrive as the design settles. */
import type { GameRegistration } from '../../framework/types'
import { MastraCommander, type MastraCommanderState } from './Game'
import { Board } from './Board'

export const mastraCommanderRegistration: GameRegistration<MastraCommanderState> = {
  id: 'mastra-and-commander',
  name: 'Mastra & Commander',
  documentTitle: 'Mastra & Commander',
  tagline: 'Asymmetric alignment duel — Operator vs. Entropy around an Eval.',
  numPlayers: 2,
  game: MastraCommander,
  board: Board,
  // Single scaffold format for now. Real formats (solo vs. two-player, pack
  // configurations) come with the engine.
  formats: [
    {
      id: 'scaffold',
      name: 'Scaffold (round-loop wiring)',
      description: 'Cycles the locked 5-phase round loop. No card mechanics yet.',
    },
  ],
  // No applyDeckExport/preloadDeck yet — the framework skips the deck-import
  // flow and starts the game immediately, exactly like the TicTacToe scaffold.
}
