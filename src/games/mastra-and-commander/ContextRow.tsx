/**
 * The Context — the left→right window (design §4).
 *
 * One row per open Process. Each slot shows the card, its contributions
 * (the Eval currency), and its unspent outputs (which fund the next card).
 */
import * as React from 'react'
import type { MCState } from './types'
import type { PipCounts } from './constants'
import { getOperatorCard } from './cards/registry'
import { slotContributions } from './rules/evalHelpers'
import { describeCallTarget } from './rules/playMoves'
import { C, COLOR_SWATCH, PIP_GLYPH, SHAPE_GLYPH, btn } from './theme'

function Pips({ counts }: { counts: PipCounts }): React.ReactElement | null {
  const parts: string[] = []
  for (const pip of ['capital', 'attention', 'technology', 'generic'] as const) {
    for (let i = 0; i < counts[pip]; i++) parts.push(PIP_GLYPH[pip] ?? '?')
  }
  if (parts.length === 0) return null
  return <span style={{ color: C.warn, letterSpacing: 1 }}>{parts.join('')}</span>
}

export function ContextRow({
  G, canRelay, onToggleRelay, onCloseProcess,
}: {
  G: MCState
  canRelay: boolean
  onToggleRelay: (chainIx: number, slotIx: number) => void
  onCloseProcess: (chainIx: number) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {G.contexts.map((chain, chainIx) => (
        <div key={chainIx}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: C.dim, fontSize: '0.8rem' }}>
              Process {chainIx + 1}{chain.closed ? ' (closed)' : ''}
            </span>
            {!chain.closed && G.phase === 'play' && (
              <button style={btn()} onClick={() => onCloseProcess(chainIx)}>Close</button>
            )}
          </div>

          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 92,
            padding: 8, background: C.panelAlt, border: `1px dashed ${C.border}`,
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
                  <div key={slotIx} style={{
                    width: 132, padding: 8, borderRadius: 6,
                    border: `1px dashed ${C.warn}`,
                    background: slot.subverted ? C.dangerBg : '#201c10',
                    opacity: slot.subverted ? 0.75 : 1,
                  }}>
                    <div style={{ fontSize: '0.72rem', color: C.warn, marginBottom: 4 }}>
                      ▾ face-down call
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                      {describeCallTarget(G, slot.calls)}
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
                    <div style={{ fontSize: '0.68rem', color: C.dim, marginTop: 4 }}>
                      skipped for I/O
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={slotIx}
                  onClick={() => { if (canRelay) onToggleRelay(chainIx, slotIx) }}
                  style={{
                    width: 132, padding: 8, borderRadius: 6,
                    border: `1px solid ${slot.relayed ? C.accent : C.border}`,
                    background: slot.subverted ? C.dangerBg : C.panel,
                    opacity: slot.subverted ? 0.75 : 1,
                    cursor: canRelay ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                    {def.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: C.dim, marginBottom: 4 }}>
                    {def.traits.join(' · ')}
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    {slot.subverted ? (
                      <span style={{ color: C.danger, fontSize: '0.72rem' }}>SUBVERTED</span>
                    ) : (
                      def.contributes.map((contrib, i) => (
                        <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 3 }}>
                          {SHAPE_GLYPH[contrib.shape]}
                        </span>
                      ))
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem' }}>
                    <Pips counts={slot.outputsRemaining} />
                  </div>
                  {slot.relayed && (
                    <div style={{ color: C.accent, fontSize: '0.68rem', marginTop: 3 }}>
                      ↻ relay
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

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
