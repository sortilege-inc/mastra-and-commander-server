/**
 * Board — composition root for the play UI.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┬──────────────┐
 *   │ header: round, phase stepper, advance    │              │
 *   │ Context (one row per Agent in play)      │  SidePanels  │
 *   │ HandPanel (rail + hand + claw hand)      │              │
 *   └──────────────────────────────────────────┴──────────────┘
 * Gate overlays render on top when a pending* field is set.
 *
 * SOLO DRIVER: design §3 says the Entropy deck "runs itself" in solo play. The
 * engine is mode-agnostic (the framework's GameMode never reaches setup()), so
 * the automation lives here: in `vs-ai` mode this component auto-dispatches the
 * Entropy-seat moves. That's the same seam framework/aiDriver.ts formalizes.
 */
import * as React from 'react'
import type { BoardProps } from 'boardgame.io/react'
import type { MCState } from './types'
import {
  PHASE_BLURB, RAG_CHAPTERS, RAG_RERANK_INDEX, RAG_UPSERT_INDEX, ROUND_PHASES,
} from './constants'
import type { RoundPhase } from './constants'
import type { CallTarget } from './types'
import { getOperatorCard } from './cards/registry'
import { useGameMode } from '../../framework/ModeContext'
import { useSwitchGame } from '../../framework/SwitchGameContext'
import { ContextRow } from './ContextRow'
import { EnginePanel } from './EnginePanel'
import { HandPanel } from './HandPanel'
import { SidePanels } from './SidePanels'
import {
  EntropyTargetOverlay, FailureScrapOverlay, FeaturePickOverlay,
} from './GateOverlays'
import type { EntropyTarget } from './rules/entropyHelpers'
import { C, btn } from './theme'
import { CardBack } from './CardFace'

const PHASE_LABEL: Record<RoundPhase, string> = {
  reveal: '1 · Reveal',
  play: '2 · Play',
  entropy: '3 · Entropy',
  response: '4 · Response',
  evalCheck: '5 · Eval check',
}

export function Board(props: BoardProps<MCState>): React.ReactElement {
  const { G, ctx, moves } = props
  const mode = useGameMode()
  const switchGame = useSwitchGame()
  const [pitches, setPitches] = React.useState<string[]>([])
  /** Which hand card is staged as a server substrate for the next install. */
  const [substrate, setSubstrate] = React.useState<string | null>(null)
  /** Which Agent's row a played card lands in (each Agent opens one). */
  const [chainChoice, setChainChoice] = React.useState(0)

  // Chains come and go — rollover collapses them, Subagents add them — so the
  // stored index can outlive its row. Clamp on read rather than tracking
  // every mutation; an out-of-range choice would make every play INVALID_MOVE.
  const targetChainIx = G.contexts[chainChoice] && !G.contexts[chainChoice].closed
    ? chainChoice
    : G.contexts.findIndex((chain) => !chain.closed) === -1
      ? 0
      : G.contexts.findIndex((chain) => !chain.closed)

  const clearPitches = () => setPitches([])

  const togglePitch = (cardId: string) => {
    setPitches((prev) => prev.includes(cardId)
      ? prev.filter((id) => id !== cardId)
      : [...prev, cardId])
  }

  // ── Solo driver ────────────────────────────────────────────────────────
  // In vs-ai mode the Entropy deck plays itself: resolve the stack top, and
  // auto-target anything that needs a target.
  React.useEffect(() => {
    if (mode !== 'vs-ai') return
    if (G.matchWinner) return
    if (G.phase !== 'entropy') return

    const timer = setTimeout(() => {
      if (G.pendingEntropyTarget) moves.autoResolveEntropyTarget()
      else if (G.entropyStack.length > 0) moves.resolveNextEntropy()
    }, 450)
    return () => clearTimeout(timer)
  }, [mode, G.phase, G.entropyStack.length, G.pendingEntropyTarget, G.matchWinner, moves])

  const gameover = ctx.gameover as { winner?: string } | undefined

  /** The RAG chapter that can be advanced next, if any. */
  const nextRagChapter = RAG_CHAPTERS[G.rag.chaptersComplete] ?? null
  /** Upsert sets RAG's payload; Rerank swaps it — both consume a card. */
  const ragNeedsCard = G.rag.chaptersComplete === RAG_UPSERT_INDEX
    || G.rag.chaptersComplete === RAG_RERANK_INDEX

  /** Everything currently callable with a face-down card. */
  const callTargets: Array<{ target: CallTarget; label: string }> = [
    ...G.servers.map((server) => ({
      target: { kind: 'server' as const, serverId: server.id },
      label: `${getOperatorCard(server.traitCardId).name} (server)`,
    })),
    ...G.skillAttachments.map((attachment) => ({
      target: { kind: 'skill' as const, loadoutId: attachment.loadoutId },
      label: `${getOperatorCard(attachment.skillCardId).name} (skill)`,
    })),
    ...(G.rag.chaptersComplete > RAG_UPSERT_INDEX
      ? [{ target: { kind: 'rag' as const }, label: 'RAG' }]
      : []),
  ]

  return (
    <div style={{
      padding: 20, color: C.text, background: C.bg, minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Mastra &amp; Commander</h1>
        <span style={{ color: C.dim }}>Round {G.round}</span>
        {mode === 'vs-ai' && (
          <span style={{ color: C.accent, fontSize: '0.8rem' }}>solo — Entropy is automated</span>
        )}
        {/* The site drops you straight into a hotseat game, so this is the only
            route back to the picker. Without it, auto-start is a one-way door. */}
        <button
          onClick={switchGame}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
            color: C.dim, fontSize: '0.78rem', cursor: 'pointer',
            textDecoration: 'underline', fontFamily: 'inherit',
          }}
        >
          Switch game
        </button>
      </div>

      {/* Phase stepper */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {ROUND_PHASES.map((phase) => {
          const active = phase === G.phase
          return (
            <div key={phase} style={{
              padding: '6px 12px', borderRadius: 6,
              border: `1px solid ${active ? C.accent : C.border}`,
              background: active ? C.accentBg : C.panel,
              color: active ? C.accent : C.dim,
              fontWeight: active ? 700 : 400, fontSize: '0.82rem',
            }}>
              {PHASE_LABEL[phase]}
            </div>
          )
        })}
      </div>

      <p style={{ color: C.dim, fontSize: '0.85rem', maxWidth: 720, margin: '0 0 12px' }}>
        {PHASE_BLURB[G.phase]}
      </p>

      {/* Phase controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          style={btn(!gameover)}
          onClick={() => { clearPitches(); moves.advancePhase() }}
        >
          Advance phase →
        </button>
        {G.phase === 'entropy' && G.entropyStack.length > 0 && mode !== 'vs-ai' && (
          <button
            style={{ ...btn(), borderColor: C.danger, color: C.danger, background: C.dangerBg }}
            onClick={() => moves.resolveNextEntropy()}
          >
            Resolve next Entropy ({G.entropyStack.length})
          </button>
        )}
        {substrate && (
          <span style={{
            color: C.warn, fontSize: '0.82rem', alignSelf: 'center',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CardBack deck="operator" width={30} ring={C.warn} />
            “{getOperatorCard(substrate).name}” staged as the face-down substrate —
            now click <strong>install</strong> on a Tool.
          </span>
        )}
        {G.phase === 'play' && callTargets.length > 0 && (
          <span style={{ color: C.dim, fontSize: '0.82rem', alignSelf: 'center' }}>
            {callTargets.length} installed resource{callTargets.length === 1 ? '' : 's'} —
            use <strong>call</strong> on any hand card to invoke one, free.
          </span>
        )}
      </div>

      {gameover && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accent,
        }}>
          <strong>Match over — {gameover.winner} wins.</strong>
        </div>
      )}

      {/* Main columns */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <EnginePanel
            G={G}
            ragButton={G.phase === 'play' && nextRagChapter ? (
              <button
                style={btn()}
                onClick={() => {
                  // Upsert and Rerank consume a card from hand; the rest don't.
                  const card = ragNeedsCard ? (pitches[0] ?? null) : null
                  moves.advanceRag(ragNeedsCard ? pitches.slice(1) : pitches, card)
                  clearPitches()
                }}
                title={ragNeedsCard
                  ? `Mark the payload card first, then any pitches. Costs ${nextRagChapter.cost}.`
                  : `Costs ${nextRagChapter.cost}.`}
              >
                {nextRagChapter.name} ({nextRagChapter.cost})
              </button>
            ) : undefined}
          />
          <ContextRow
            G={G}
            canRelay={G.phase === 'evalCheck'}
            targetChainIx={targetChainIx}
            onSelectChain={setChainChoice}
            onToggleRelay={(chainIx, slotIx) => moves.toggleRelay(chainIx, slotIx)}
            onCloseProcess={(chainIx) => moves.closeProcess(chainIx)}
          />
          <HandPanel
            G={G}
            selectedPitches={pitches}
            onTogglePitch={togglePitch}
            onPlay={(cardId) => {
              moves.playToContext(targetChainIx, cardId, pitches.filter((id) => id !== cardId))
              clearPitches()
            }}
            onEvent={(cardId) => {
              moves.playEvent(cardId, pitches.filter((id) => id !== cardId))
              clearPitches()
            }}
            onResponse={(cardId) => {
              // Restore-type responses need the card they are un-subverting.
              // Aim at the first subverted slot in any row rather than
              // slot 0, which is rarely the damaged one.
              let chainIx = targetChainIx
              let slotIx = 0
              outer: for (let c = 0; c < G.contexts.length; c++) {
                const slots = G.contexts[c]?.slots ?? []
                for (let s = 0; s < slots.length; s++) {
                  if (slots[s]?.subverted) { chainIx = c; slotIx = s; break outer }
                }
              }
              moves.playResponse(cardId, pitches.filter((id) => id !== cardId), chainIx, slotIx)
              clearPitches()
            }}
            callTargets={callTargets}
            onCall={(cardId, target) => {
              moves.callInstalled(targetChainIx, cardId, target)
              clearPitches()
            }}
            onAttachSkill={(cardId, loadoutId) => {
              moves.attachSkill(loadoutId, cardId, pitches.filter((id) => id !== cardId))
              clearPitches()
            }}
            onClaw={(cardId) => { moves.loadClaw(cardId); clearPitches() }}
            onSpawnAgents={(cardId) => {
              // Agents spawn as children of the row you are playing from.
              moves.spawnAgents(cardId, targetChainIx)
              clearPitches()
            }}
            onUpgrade={(cardId) => {
              moves.upgradeModel(cardId, pitches.filter((id) => id !== cardId))
              clearPitches()
            }}
            onStageSubstrate={setSubstrate}
            onInstallTool={(cardId) => {
              // A server needs a face-down substrate under the Tool.
              if (!substrate || substrate === cardId) return
              moves.installServer(substrate, cardId, pitches.filter(
                (id) => id !== cardId && id !== substrate,
              ))
              setSubstrate(null)
              clearPitches()
            }}
          />
        </div>

        <SidePanels G={G} />
      </div>

      {/* Gates */}
      {G.pendingFeaturePicks && (
        <FeaturePickOverlay
          G={G}
          onPick={(cardId) => moves.pickFeature(cardId)}
          onSkip={() => moves.skipFeaturePicks()}
        />
      )}
      {G.pendingEntropyTarget && mode !== 'vs-ai' && (
        <EntropyTargetOverlay
          G={G}
          onChoose={(target: EntropyTarget) => moves.chooseEntropyTarget(target)}
          onAuto={() => moves.autoResolveEntropyTarget()}
        />
      )}
      {G.pendingFailureScrap && (
        <FailureScrapOverlay
          G={G}
          onScrap={(cardId) => moves.scrapForEntropy(cardId)}
          onAccept={() => moves.acceptOutcome()}
        />
      )}
    </div>
  )
}
