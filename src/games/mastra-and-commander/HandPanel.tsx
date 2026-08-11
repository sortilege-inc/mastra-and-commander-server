/**
 * The Operator's hand and the completed Claw's second hand.
 *
 * The permanent apparatus (framework, model, loadout, servers, claw, RAG) lives
 * in EnginePanel — this file is only the cards you can act with right now.
 *
 * Pitch selection: click a card's ⊕ to mark it as a pitch, then play another
 * card — the marked cards are passed as the move's `pitchIds`.
 */
import * as React from 'react'
import type { MCState } from './types'
import { getEquipment, getOperatorCard } from './cards/registry'
import { C, btn } from './theme'
import { CardFace } from './CardFace'
import { TRAIT_EVENT, TRAIT_MODEL, TRAIT_RESPONSE } from './constants'
import type { CallTarget } from './types'

export function HandPanel({
  G, selectedPitches, callTargets, onTogglePitch, onPlay, onEvent, onResponse,
  onCall, onAttachSkill, onClaw, onUpgrade, onInstallTool, onStageSubstrate,
}: {
  G: MCState
  selectedPitches: string[]
  callTargets: Array<{ target: CallTarget; label: string }>
  onTogglePitch: (cardId: string) => void
  onPlay: (cardId: string) => void
  onEvent: (cardId: string) => void
  onResponse: (cardId: string) => void
  onCall: (cardId: string, target: CallTarget) => void
  onAttachSkill: (cardId: string, equipmentId: string) => void
  onClaw: (cardId: string) => void
  onUpgrade: (cardId: string) => void
  /** Install this Tool onto the staged face-down substrate. */
  onInstallTool: (cardId: string) => void
  /** Stage this card as the face-down substrate for the next install. */
  onStageSubstrate: (cardId: string) => void
}): React.ReactElement {
  const inPlay = G.phase === 'play'
  const inResponse = G.phase === 'response'
  /** Loadout slots with no Skill on them yet. */
  const freeEquipment = G.loadout.filter(
    (id) => !G.skillAttachments.some((a) => a.equipmentId === id))

  const renderCard = (cardId: string, ix: number, fromClaw: boolean) => {
    const def = getOperatorCard(cardId)
    const pitched = selectedPitches.includes(cardId)
    const isEvent = def.traits.includes(TRAIT_EVENT)
    const isResponse = def.traits.includes(TRAIT_RESPONSE)
    const isModel = def.traits.includes(TRAIT_MODEL)
    const isTool = def.traits.includes('Tool') || def.traits.includes('MCP')
    const isSkill = def.traits.includes('Skill')

    return (
      <div
        key={`${cardId}-${ix}`}
        style={{
          width: 154, padding: 8, borderRadius: 6,
          border: `1px solid ${pitched ? C.warn : C.border}`,
          background: pitched ? '#2a2415' : C.panel,
        }}
      >
        {/* The printed face carries name, traits, cost, produce and
            contributions, so none of that is repeated below — only the state
            the card can't show (pitched, claw) and the actions. Hover to read
            the rails and rules text at a legible size. */}
        <CardFace
          cardId={cardId}
          label={def.name}
          width={138}
          ring={pitched ? C.warn : null}
        />
        <div style={{
          fontSize: '0.68rem', color: pitched ? C.warn : C.dim,
          margin: '4px 0 6px', minHeight: 14,
        }}>
          {pitched ? 'marked to pitch' : ''}
          {fromClaw ? (pitched ? ' · claw' : 'claw') : ''}
          {(def.keywords ?? []).length > 0 && (
            <span style={{ color: C.accent }}>
              {(pitched || fromClaw ? ' · ' : '') + (def.keywords ?? []).join(' ')}
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
          {/* Tool: install as a persistent MCP server (Durable) — needs a
              face-down substrate, staged by clicking `substrate` on any card. */}
          {inPlay && isTool && (
            <button
              style={btn()}
              onClick={() => onInstallTool(cardId)}
              title="Install as an MCP server: Durable, persists all match, 2 Entropy. Stage a substrate first."
            >
              install
            </button>
          )}
          {/* Skill: attach to a free loadout slot, gaining Durable. */}
          {inPlay && isSkill && freeEquipment.map((equipmentId) => (
            <button
              key={equipmentId}
              style={btn()}
              onClick={() => onAttachSkill(cardId, equipmentId)}
              title="Attach to this loadout item: Durable, persists all match"
            >
              →{getEquipment(equipmentId).name}
            </button>
          ))}
          {/* Any card can be spent face-down to CALL an installed resource. */}
          {inPlay && callTargets.map(({ target, label }, i) => (
            <button
              key={i}
              style={{ ...btn(), borderColor: C.warn, color: C.warn }}
              onClick={() => onCall(cardId, target)}
              title="Play face-down to invoke this installed resource — free"
            >
              call {label}
            </button>
          ))}
          {inPlay && !fromClaw && (
            <>
              <button style={btn()} onClick={() => onClaw(cardId)}>→claw</button>
              <button
                style={btn()}
                onClick={() => onStageSubstrate(cardId)}
                title="Stage as the face-down substrate for a server install"
              >
                substrate
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
