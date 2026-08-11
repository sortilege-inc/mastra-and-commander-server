/**
 * Side panels: the current objective, the Entropy stack, this round's context
 * and feature state, the match record, and the log.
 *
 * The persistent apparatus (framework / model / loadout / servers / claw / RAG)
 * is NOT here — it lives in EnginePanel across the top, where it has room for
 * actual cards.
 */
import * as React from 'react'
import type { MCState } from './types'
import { getEvalCard, getFeatureCard } from './cards/registry'
import { contextSize, contributionsOf, matchEval } from './rules/evalHelpers'
import { C, COLOR_SWATCH, SHAPE_GLYPH, panel } from './theme'
import { CardBack, CardFace } from './CardFace'
import { RulesText } from './RulesText'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={panel}>
      <div style={{ fontSize: '0.72rem', color: C.dim, letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function SidePanels({ G }: { G: MCState }): React.ReactElement {
  const evalDef = G.currentEvalId ? getEvalCard(G.currentEvalId) : null
  const contribs = contributionsOf(G)
  const size = contextSize(G)
  const met = evalDef ? matchEval(contribs, evalDef) : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 320 }}>
      {/* Objective */}
      <Section title="OBJECTIVE">
        {evalDef ? (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <CardFace cardId={evalDef.id} label={evalDef.name} width={96} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{evalDef.name}</div>
                <div style={{ fontSize: '0.78rem', color: C.dim }}>
                  <RulesText text={evalDef.rulesText} />
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              par {evalDef.par}
              {evalDef.superiorAt !== undefined && ` · superior ≤${evalDef.superiorAt}`}
              {' · difficulty '}{evalDef.difficulty}
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: 6 }}>
              context {size} · pattern{' '}
              <strong style={{ color: met ? C.accent : C.danger }}>
                {met ? 'MET' : 'not met'}
              </strong>
            </div>
            <div style={{ marginTop: 6 }}>
              {contribs.map((contrib, i) => (
                <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 3 }}>
                  {SHAPE_GLYPH[contrib.shape]}
                </span>
              ))}
              {contribs.length === 0 && <span style={{ color: C.dim }}>no contributions yet</span>}
            </div>
          </>
        ) : (
          <span style={{ color: C.dim }}>No objective.</span>
        )}
      </Section>

      {/* Entropy — the stack is drawn as an actual pile, because its height is
          the thing the Operator is playing against all round. */}
      <Section title="ENTROPY">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {G.entropyStack.length > 0
            ? (
              <CardBack
                deck="entropy"
                width={58}
                count={G.entropyStack.length}
                ring={C.danger}
                label={`stack ${G.entropyStack.length}`}
              />
            )
            : (
              <div style={{
                width: 58, height: 79, borderRadius: 8, flexShrink: 0,
                border: `1px dashed ${C.border}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: C.accent, fontSize: '0.7rem',
              }}>
                clear
              </div>
            )}
          <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
            <div>deck {G.entropyDeck.length}</div>
            <div>resolved {G.entropyResolved.length}</div>
            <div style={{ color: C.dim }}>fed this round: {G.entropyFedThisRound}</div>
          </div>
        </div>
      </Section>

      {/* Contexts + Features. The apparatus itself (servers / claw / RAG)
          now lives in the engine row, where it gets real cards. */}
      <Section title="THIS ROUND">
        <div style={{ fontSize: '0.8rem', lineHeight: 1.7 }}>
          <div>
            Contexts {G.contexts.length}
            <span style={{ color: C.dim }}>
              {' '}(ceiling {G.contexts[0]?.ceiling ?? '—'}; {G.processLimit} process
              {G.processLimit === 1 ? '' : 'es'})
            </span>
          </div>
          <div>
            Features{' '}
            {G.activeFeatureIds.length > 0
              ? G.activeFeatureIds.map((id) => getFeatureCard(id).name).join(', ')
              : <span style={{ color: C.dim }}>none</span>}
          </div>
        </div>
      </Section>

      {/* Record */}
      {G.roundResults.length > 0 && (
        <Section title="RECORD">
          {G.roundResults.map((r, i) => (
            <div key={i} style={{ fontSize: '0.8rem' }}>
              R{r.round} {getEvalCard(r.evalId).name}:{' '}
              <strong style={{ color: r.tier === 'failure' ? C.danger : C.accent }}>
                {r.tier}
              </strong>
            </div>
          ))}
        </Section>
      )}

      {/* Log */}
      <Section title="LOG">
        <div style={{
          maxHeight: 220, overflowY: 'auto', fontSize: '0.72rem',
          fontFamily: 'ui-monospace, monospace', color: C.dim, lineHeight: 1.6,
        }}>
          {G.log.slice(-40).map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </Section>
    </div>
  )
}
