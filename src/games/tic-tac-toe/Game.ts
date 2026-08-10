/**
 * Placeholder game: TicTacToe.
 *
 * This is boardgame.io's canonical hello-world. We use it to verify the
 * client/server/state wiring is healthy before we start modeling Legend
 * of the Five Rings (or any other TCG) on top.
 *
 * Move-function signature (boardgame.io v0.50):
 *   ({ G, ctx, ...pluginAPIs, playerID }, ...args) => void | G | INVALID_MOVE
 *
 * Game state mutations happen in-place via the `G` argument (Immer
 * under the hood), so you don't need to return a new state object —
 * just modify what's there.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import type { Game } from 'boardgame.io'

export interface TicTacToeState {
  /** 9-cell board, indexed 0-8 (top-left to bottom-right).
   *  Each cell is null (empty) or a playerID string ('0' or '1'). */
  cells: (string | null)[]
}

export const TicTacToe: Game<TicTacToeState> = {
  name: 'tic-tac-toe',
  minPlayers: 2,
  maxPlayers: 2,

  setup: () => ({
    cells: Array(9).fill(null),
  }),

  moves: {
    clickCell: ({ G, playerID }, id: number) => {
      if (G.cells[id] !== null) return INVALID_MOVE
      G.cells[id] = playerID
    },
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  endIf: ({ G, ctx }) => {
    if (isVictory(G.cells)) return { winner: ctx.currentPlayer }
    if (isDraw(G.cells)) return { draw: true }
  },
}

const winLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
]

function isVictory(cells: (string | null)[]): boolean {
  return winLines.some((line) => {
    const [a, b, c] = line
    return cells[a!] !== null && cells[a!] === cells[b!] && cells[a!] === cells[c!]
  })
}

function isDraw(cells: (string | null)[]): boolean {
  return cells.every((c) => c !== null)
}
