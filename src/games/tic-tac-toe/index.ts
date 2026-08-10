/** Per-game entry point — register TicTacToe with the framework.
 *  Kept around as a working scaffold while real games come online. */
import type { GameRegistration } from '../../framework/types'
import { TicTacToe, type TicTacToeState } from './Game'
import { Board } from './Board'

export const ticTacToeRegistration: GameRegistration<TicTacToeState> = {
  id: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  tagline: 'boardgame.io hello-world; useful for verifying the wiring.',
  numPlayers: 2,
  game: TicTacToe,
  board: Board,
  formats: [
    {
      id: 'standard',
      name: 'Standard',
      description: '3×3 board, win with three in a row.',
    },
  ],
}
