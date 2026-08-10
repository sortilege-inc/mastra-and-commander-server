/**
 * Renderer for the placeholder TicTacToe game.
 *
 * boardgame.io passes us a `BoardProps<G>` — props include:
 *   - G: the current game state (our TicTacToeState).
 *   - ctx: framework metadata (currentPlayer, gameover, turn, ...).
 *   - moves: dispatch helpers; each move is a function we declared in
 *     Game.ts's `moves` map.
 *   - playerID: which player WE are (null in local hot-seat mode; the
 *     framework alternates currentPlayer between us and our opponent).
 *
 * We render a 3x3 grid; clicking an empty cell invokes the `clickCell`
 * move. Gameover banner shown when ctx.gameover is set.
 */
import * as React from 'react'
import type { BoardProps } from 'boardgame.io/react'
import type { TicTacToeState } from './Game'

const CELL: React.CSSProperties = {
  border: '1px solid #444',
  width: 64,
  height: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '2rem',
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
  background: '#1a1a1a',
  color: '#eaeaea',
}

const CELL_DISABLED: React.CSSProperties = {
  ...CELL,
  cursor: 'not-allowed',
  opacity: 0.7,
}

export function Board(props: BoardProps<TicTacToeState>): React.ReactElement {
  const { G, ctx, moves } = props
  const gameover = ctx.gameover as { winner?: string; draw?: boolean } | undefined

  const symbol = (cell: string | null): string => {
    if (cell === null) return ''
    return cell === '0' ? '×' : '○'
  }

  const cells: React.ReactElement[] = []
  for (let i = 0; i < 9; i++) {
    const filled = G.cells[i] !== null
    cells.push(
      <div
        key={i}
        style={filled ? CELL_DISABLED : CELL}
        onClick={() => { if (!filled) moves.clickCell(i) }}
      >
        {symbol(G.cells[i] ?? null)}
      </div>
    )
  }

  return (
    <div style={{ padding: 32, color: '#eaeaea', background: '#0d0d0d', minHeight: '100vh' }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Tic-Tac-Toe</h1>
      <p style={{ opacity: 0.7, marginTop: 0, marginBottom: 24, fontFamily: 'system-ui' }}>
        Boardgame.io hello-world. Kept as a known-good wiring proof alongside the
        Mastra &amp; Commander game scaffold.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 4 }}>
        {cells}
      </div>

      <div style={{ marginTop: 24, fontFamily: 'system-ui' }}>
        {gameover ? (
          <strong style={{ color: '#7fd1a2' }}>
            {gameover.winner !== undefined
              ? `Player ${gameover.winner === '0' ? '× (0)' : '○ (1)'} wins!`
              : 'Draw.'}
          </strong>
        ) : (
          <span>Current turn: <strong>{ctx.currentPlayer === '0' ? '× (0)' : '○ (1)'}</strong></span>
        )}
      </div>
    </div>
  )
}
