/**
 * Overlays for the pending gates.
 *
 * Component names here MUST match the `overlay` fields in gates.ts —
 * gates.test.ts asserts the correspondence, so a rename in one place fails the
 * build in the other (the point of the manifest).
 */
import * as React from 'react'
import type { MCState } from './types'
import { getEntropyCard, getFeatureCard, getOperatorCard } from './cards/registry'
import { CardFace } from './CardFace'
import { RulesText } from './RulesText'
import { eligibleTargets } from './rules/entropyHelpers'
import type { EntropyTarget } from './rules/entropyHelpers'
import { scrappableCards } from './rules/phaseHelpers'
import { C, btn } from './theme'

function Overlay({ title, subtitle, children }: {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        background: C.panel, border: `1px solid ${C.borderBright}`, borderRadius: 10,
        padding: 20, minWidth: 420, maxWidth: 640, color: C.text,
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: '0.82rem', color: C.dim, marginBottom: 12 }}>{subtitle}</div>
        )}
        {children}
      </div>
    </div>
  )
}

/** Gate: pendingFeaturePicks */
export function FeaturePickOverlay({ G, onPick, onSkip }: {
  G: MCState
  onPick: (cardId: string) => void
  onSkip: () => void
}): React.ReactElement {
  const remaining = G.pendingFeaturePicks?.remaining ?? 0
  return (
    <Overlay
      title="Select Features"
      subtitle={`${remaining} pick(s) remaining — Features cost no Entropy.`}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {G.featureOffer.map((id) => {
          const def = getFeatureCard(id)
          return (
            <div key={id} style={{
              width: 170, padding: 10, borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.panelAlt,
            }}>
              {/* No hover zoom inside an overlay — the preview would land on
                  top of the very buttons you are trying to click. */}
              <CardFace cardId={id} label={def.name} width={150} zoom={false} />
              <div style={{ fontSize: '0.75rem', color: C.dim, margin: '6px 0 8px' }}>
                <RulesText text={def.rulesText} />
              </div>
              <button style={btn()} onClick={() => onPick(id)}>Select</button>
            </div>
          )
        })}
      </div>
      <button style={btn()} onClick={onSkip}>Decline remaining</button>
    </Overlay>
  )
}

/** Gate: pendingEntropyTarget */
export function EntropyTargetOverlay({ G, onChoose, onAuto }: {
  G: MCState
  onChoose: (target: EntropyTarget) => void
  onAuto: () => void
}): React.ReactElement | null {
  const gate = G.pendingEntropyTarget
  if (!gate) return null
  const def = getEntropyCard(gate.entropyCardId)
  const targets = eligibleTargets(G, def.effect)

  return (
    <Overlay title={`Entropy: ${def.name}`} subtitle={<RulesText text={def.rulesText} />}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
        <CardFace cardId={def.id} label={def.name} width={130} zoom={false} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
        {targets.map((target, i) => (
          <button
            key={i}
            style={{ ...btn(), borderColor: C.danger, color: C.danger, background: C.dangerBg }}
            onClick={() => onChoose(target)}
          >
            {target.label}
          </button>
        ))}
          {targets.length === 0 && <span style={{ color: C.dim }}>No legal targets.</span>}
        </div>
      </div>
      <button style={btn()} onClick={onAuto}>Auto-resolve (leftmost)</button>
    </Overlay>
  )
}

/** Gate: pendingFailureScrap */
export function FailureScrapOverlay({ G, onScrap, onAccept }: {
  G: MCState
  onScrap: (cardId: string) => void
  onAccept: () => void
}): React.ReactElement {
  const options = scrappableCards(G)
  return (
    <Overlay
      title="Eval failed"
      subtitle="Entropy persists into the next round. You may scrap your own engine to shed it — a Durable card removes 3, a Setup card removes 5."
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {options.map((option, i) => (
          <button key={i} style={btn()} onClick={() => onScrap(option.cardId)}>
            Scrap {getOperatorCard(option.cardId).name} (−{option.removes})
          </button>
        ))}
        {options.length === 0 && (
          <span style={{ color: C.dim }}>Nothing scrappable in play.</span>
        )}
      </div>
      <button style={btn()} onClick={onAccept}>Accept outcome</button>
    </Overlay>
  )
}
