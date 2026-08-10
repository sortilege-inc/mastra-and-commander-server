/**
 * The Operator's hand, the completed Claw's second hand, and the resource rail
 * (commander, equipment, model, round pool).
 *
 * Pitch selection: click a card's ⊕ to mark it as a pitch, then play another
 * card — the marked cards are passed as the move's `pitchIds`.
 */
import * as React from 'react'
import type { MCState } from './types'
import { getCommander, getEquipment, getModel, getOperatorCard } from './cards/registry'
import { C, COLOR_SWATCH, PIP_GLYPH, SHAPE_GLYPH, btn, panel } from './theme'
import { TRAIT_EVENT, TRAIT_MODEL, TRAIT_RESPONSE, INSTALLABLE_TRAITS } from './constants'
import type { Pip } from './constants'

const pipRow = (pips: Pip[]): string =>
  pips.map((p) => PIP_GLYPH[p] ?? '?').join('') || '—'

export function HandPanel({
  G, selectedPitches, onTogglePitch, onPlay, onEvent, onResponse, onCommander,
  onRag, onClaw, onUpgrade, onInstall,
}: {
  G: MCState
  selectedPitches: string[]
  onTogglePitch: (cardId: string) => void
  onPlay: (cardId: string) => void
  onEvent: (cardId: string) => void
  onResponse: (cardId: string) => void
  onCommander: (cardId: string) => void
  onRag: (cardId: string) => void
  onClaw: (cardId: string) => void
  onUpgrade: (cardId: string) => void
  onInstall: (cardId: string) => void
}): React.ReactElement {
  const commander = getCommander(G.commanderId)
  const model = getModel(G.installedModelId)
  const inPlay = G.phase === 'play'
  const inResponse = G.phase === 'response'

  const renderCard = (cardId: string, ix: number, fromClaw: boolean) => {
    const def = getOperatorCard(cardId)
    const pitched = selectedPitches.includes(cardId)
    const isEvent = def.traits.includes(TRAIT_EVENT)
    const isResponse = def.traits.includes(TRAIT_RESPONSE)
    const isModel = def.traits.includes(TRAIT_MODEL)
    const installable = def.traits.some((t) => (INSTALLABLE_TRAITS as readonly string[]).includes(t))

    return (
      <div
        key={`${cardId}-${ix}`}
        style={{
          width: 154, padding: 8, borderRadius: 6,
          border: `1px solid ${pitched ? C.warn : C.border}`,
          background: pitched ? '#2a2415' : C.panel,
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{def.name}</div>
        <div style={{ fontSize: '0.68rem', color: C.dim, marginBottom: 4 }}>
          {def.traits.join(' · ')}{fromClaw ? ' · claw' : ''}
          {def.ecosystem ? ` · ${def.ecosystem}` : ''}
        </div>
        <div style={{ fontSize: '0.72rem', marginBottom: 3 }}>
          <span style={{ color: C.dim }}>cost </span>
          <span style={{ color: C.warn }}>{pipRow(def.consume)}</span>
          <span style={{ color: C.dim }}> → </span>
          <span style={{ color: C.accent }}>{pipRow(def.produce)}</span>
        </div>
        <div style={{ marginBottom: 6 }}>
          {def.contributes.map((contrib, i) => (
            <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 3 }}>
              {SHAPE_GLYPH[contrib.shape]}
            </span>
          ))}
          {(def.keywords ?? []).length > 0 && (
            <span style={{ color: C.accent, fontSize: '0.68rem', marginLeft: 4 }}>
              {(def.keywords ?? []).join(' ')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button style={btn(inPlay || inResponse)} onClick={() => onTogglePitch(cardId)}>
            {pitched ? '− pitch' : '+ pitch'}
          </button>
          {inPlay && !isEvent && !isResponse && (
            <button style={btn()} onClick={() => onPlay(cardId)}>play</button>
          )}
          {inPlay && isEvent && (
            <button style={btn()} onClick={() => onEvent(cardId)}>event</button>
          )}
          {inResponse && isResponse && (
            <button style={btn()} onClick={() => onResponse(cardId)}>respond</button>
          )}
          {inPlay && isModel && (
            <button style={btn()} onClick={() => onUpgrade(cardId)}>upgrade</button>
          )}
          {inPlay && installable && (
            <button style={btn()} onClick={() => onInstall(cardId)}>install</button>
          )}
          {inPlay && !fromClaw && (
            <>
              <button style={btn()} onClick={() => onRag(cardId)}>→RAG</button>
              <button style={btn()} onClick={() => onClaw(cardId)}>→claw</button>
              <button style={btn()} onClick={() => onCommander(cardId)}>→cmdr</button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Resource rail */}
      <div style={{ ...panel, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: C.dim }}>COMMANDER</div>
          <div style={{ fontSize: '0.85rem' }}>{commander.name}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: C.dim }}>MODEL</div>
          <div style={{ fontSize: '0.85rem' }}>{model.name}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: C.dim }}>LOADOUT</div>
          <div style={{ fontSize: '0.85rem' }}>
            {G.loadout.map((id) => getEquipment(id).name).join(' · ')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: C.dim }}>ROUND POOL</div>
          <div style={{ fontSize: '0.95rem', color: C.warn, letterSpacing: 2 }}>
            {(['capital', 'attention', 'technology', 'generic'] as const)
              .flatMap((pip) => Array(G.roundPool[pip]).fill(PIP_GLYPH[pip]))
              .join('') || '—'}
          </div>
        </div>
      </div>

      {/* Hand */}
      <div>
        <div style={{ fontSize: '0.8rem', color: C.dim, marginBottom: 4 }}>
          HAND ({G.operatorHand.length})
          {selectedPitches.length > 0 && (
            <span style={{ color: C.warn }}> — {selectedPitches.length} marked to pitch</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {G.operatorHand.map((id, ix) => renderCard(id, ix, false))}
        </div>
      </div>

      {G.clawHand.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', color: C.accent, marginBottom: 4 }}>
            CLAW — second hand ({G.clawHand.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {G.clawHand.map((id, ix) => renderCard(id, ix, true))}
          </div>
        </div>
      )}
    </div>
  )
}
