/**
 * Renderer for the Mastra & Commander scaffold.
 *
 * Shows the locked round loop (game-design.md §2) as a five-step stepper,
 * highlights the current phase, and offers a single "Advance" control that
 * steps to the next phase. This is a wiring proof, not the real board —
 * there is no Context row, Eval hand, Entropy stack, or card UI yet.
 */
import * as React from 'react'
import type { BoardProps } from 'boardgame.io/react'
import { ROUND_PHASES, PHASE_BLURB, type MastraCommanderState, type RoundPhase } from './Game'

const PHASE_LABEL: Record<RoundPhase, string> = {
  reveal: '1 · Reveal',
  play: '2 · Play',
  entropy: '3 · Entropy',
  response: '4 · Response',
  evalCheck: '5 · Eval check',
}

export function Board(props: BoardProps<MastraCommanderState>): React.ReactElement {
  const { G, ctx, moves } = props
  const current = (ctx.phase ?? 'reveal') as RoundPhase

  return (
    <div style={{
      padding: 32, color: '#eaeaea', background: '#0d0d0d',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ margin: 0, marginBottom: 4 }}>Mastra &amp; Commander</h1>
      <p style={{ opacity: 0.6, marginTop: 0, marginBottom: 24 }}>
        Play-engine scaffold — proves the boardgame.io wiring by cycling the
        locked round loop. The real Context / Eval / Entropy board comes once
        the design settles.
      </p>

      <div style={{ marginBottom: 8, opacity: 0.8 }}>Round <strong>{G.round}</strong></div>

      {/* Round-loop stepper */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ROUND_PHASES.map((p) => {
          const active = p === current
          return (
            <div key={p} style={{
              padding: '8px 14px', borderRadius: 6,
              border: `1px solid ${active ? '#7fd1a2' : '#333'}`,
              background: active ? '#173026' : '#161616',
              color: active ? '#7fd1a2' : '#9a9a9a',
              fontWeight: active ? 700 : 400,
            }}>
              {PHASE_LABEL[p]}
            </div>
          )
        })}
      </div>

      <p style={{ maxWidth: 620, minHeight: 40, lineHeight: 1.5 }}>
        {PHASE_BLURB[current]}
      </p>

      <button
        onClick={() => moves.advance()}
        style={{
          padding: '10px 18px', borderRadius: 6, border: '1px solid #7fd1a2',
          background: '#173026', color: '#7fd1a2', cursor: 'pointer',
          fontSize: '1rem', fontWeight: 600,
        }}
      >
        Advance →
      </button>

      <details style={{ marginTop: 28, opacity: 0.7 }}>
        <summary style={{ cursor: 'pointer' }}>Phase log</summary>
        <ul style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>
          {G.log.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </details>
    </div>
  )
}
