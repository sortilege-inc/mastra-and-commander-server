/**
 * The Context — the left→right window (design §4).
 *
 * One context per Agent in play. Each slot shows the card, its contributions
 * (the Eval currency), and its unspent outputs (which fund the next card).
 */
import * as React from 'react'
import type { MCState } from './types'
import type { PipCounts } from './constants'
import { getOperatorCard } from './cards/registry'
import { slotContributions } from './rules/evalHelpers'
import { describeCallTarget } from './rules/playMoves'
import { C, COLOR_SWATCH, PIP_GLYPH, SHAPE_GLYPH, btn } from './theme'
import { CardBack, CardFace } from './CardFace'

function Pips({ counts }: { counts: PipCounts }): React.ReactElement | null {
  const parts: string[] = []
  for (const pip of ['capital', 'attention', 'technology', 'generic'] as const) {
    for (let i = 0; i < counts[pip]; i++) parts.push(PIP_GLYPH[pip] ?? '?')
  }
  if (parts.length === 0) return null
  return <span style={{ color: C.warn, letterSpacing: 1 }}>{parts.join('')}</span>
}

export function ContextRow({
  G, canRelay, targetChainIx, onSelectChain, onToggleRelay, onCloseProcess,
}: {
  G: MCState
  canRelay: boolean
  /** Which Agent's row a played card lands in. */
  targetChainIx: number
  onSelectChain: (chainIx: number) => void
  onToggleRelay: (chainIx: number, slotIx: number) => void
  onCloseProcess: (chainIx: number) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {G.contexts.map((chain, chainIx) => {
        // With Parallelism or a Subagent open, plays have to know WHICH window
        // they land in. Selecting the target is done by clicking the row
        // itself, so the choice lives next to the thing being chosen.
        const selectable = G.phase === 'play' && !chain.closed && G.contexts.length > 1
        const isTarget = chainIx === targetChainIx && !chain.closed
        const parent = chain.parentChainIx

        return (
        <div key={chainIx} style={parent !== null ? { marginLeft: 24 } : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              onClick={() => { if (selectable) onSelectChain(chainIx) }}
              style={{
                color: isTarget ? C.accent : C.dim, fontSize: '0.8rem',
                fontWeight: isTarget ? 700 : 400,
                cursor: selectable ? 'pointer' : 'default',
              }}
            >
              {parent === null
                ? `Context ${chainIx + 1}`
                : `↳ Context ${chainIx + 1} — subagent of Context ${parent + 1}`}
              {chain.closed ? ' (closed)' : ''}
              {' '}
              <span style={{ fontWeight: 400, opacity: 0.75 }}>
                {chain.slots.length}/{chain.ceiling}
              </span>
            </span>
            {isTarget && G.contexts.length > 1 && (
              <span style={{ color: C.accent, fontSize: '0.72rem' }}>← plays land here</span>
            )}
            {selectable && !isTarget && (
              <button style={btn()} onClick={() => onSelectChain(chainIx)}>Play here</button>
            )}
            {!chain.closed && G.phase === 'play' && (
              <button style={btn()} onClick={() => onCloseProcess(chainIx)}>Close</button>
            )}
          </div>

          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 170,
            alignItems: 'flex-start',
            padding: 8, background: C.panelAlt,
            border: `1px ${isTarget && G.contexts.length > 1 ? 'solid' : 'dashed'} ${
              isTarget && G.contexts.length > 1 ? C.accent : C.border}`,
            borderRadius: 8,
          }}>
            {chain.slots.length === 0 && (
              <span style={{ color: C.dim, fontSize: '0.85rem', alignSelf: 'center' }}>
                Empty — play a card to start the chain.
              </span>
            )}

            {chain.slots.map((slot, slotIx) => {
              const def = getOperatorCard(slot.cardId)

              // A face-down CALL shows the resource it invoked, NOT the card
              // spent to make the call — that card is face-down and its printed
              // face is irrelevant (it is also what actually scores).
              if (slot.faceDown && slot.calls) {
                const contributions = slotContributions(G, slot)
                return (
                  <div key={slotIx} style={{ width: 112 }}>
                    {/* A card back, because that is literally what is on the
                        table — the spent card's identity is concealed and
                        irrelevant. What scores is the resource it invoked. */}
                    <CardBack
                      deck="operator"
                      width={112}
                      ring={slot.subverted ? C.danger : C.warn}
                    />
                    <div style={{
                      fontSize: '0.72rem', fontWeight: 600, marginTop: 4,
                      color: slot.subverted ? C.danger : C.warn,
                    }}>
                      ▾ {describeCallTarget(G, slot.calls)}
                    </div>
                    <div>
                      {slot.subverted ? (
                        <span style={{ color: C.danger, fontSize: '0.72rem' }}>SUBVERTED</span>
                      ) : contributions.map((contrib, i) => (
                        <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 3 }}>
                          {SHAPE_GLYPH[contrib.shape]}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: C.dim }}>skipped for I/O</div>
                  </div>
                )
              }

              return (
                <div
                  key={slotIx}
                  onClick={() => { if (canRelay) onToggleRelay(chainIx, slotIx) }}
                  title={canRelay ? 'Click to relay this card into the next round' : undefined}
                  style={{ width: 112, cursor: canRelay ? 'pointer' : 'default' }}
                >
                  <CardFace
                    cardId={slot.cardId}
                    label={def.name}
                    width={112}
                    dimmed={slot.subverted}
                    ring={slot.relayed ? C.accent : (slot.subverted ? C.danger : null)}
                  />
                  {/* Only the state the printed face can't show: what this card
                      still has left to fund the next one, and its round-end fate. */}
                  <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
                    {slot.subverted
                      ? <span style={{ color: C.danger }}>SUBVERTED</span>
                      : <Pips counts={slot.outputsRemaining} />}
                  </div>
                  {slot.relayed && (
                    <div style={{ color: C.accent, fontSize: '0.68rem' }}>↻ relay</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )
      })}

      {G.injectedContributions.length > 0 && (
        <div style={{ fontSize: '0.8rem', color: C.danger }}>
          Injected junk:{' '}
          {G.injectedContributions.map((contrib, i) => (
            <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 3 }}>
              {SHAPE_GLYPH[contrib.shape]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
