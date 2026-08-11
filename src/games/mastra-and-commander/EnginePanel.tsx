/**
 * The engine row — everything you permanently own, on one line.
 *
 * Framework, Model, Loadout, Servers, the Claw and RAG all sit here together,
 * because they are the same kind of thing: persistent apparatus you build up
 * and that Entropy attacks. They used to be split between a card rail and a
 * cramped text list in the side column, which made the servers and RAG feel
 * like footnotes rather than the engine you are assembling.
 *
 * Each group collapses to a one-line summary and expands to real cards, so the
 * row stays readable once several subsystems are running. Round Pool sits
 * underneath — it is per-round state, not apparatus.
 */
import * as React from 'react'
import type { MCState } from './types'
import { RAG_CHAPTERS, RAG_RERANK_INDEX, RAG_UPSERT_INDEX, CLAW_COMPLETE_COUNT } from './constants'
import { getEquipment, getFramework, getModel, getOperatorCard } from './cards/registry'
import { C, COLOR_SWATCH, PIP_GLYPH, SHAPE_GLYPH, panel } from './theme'
import { CardBack, CardFace } from './CardFace'

/** Card width inside an expanded group — mid-size: art and title legible,
 *  full detail one hover away. */
const CARD = 104
/** The always-present anchors (framework / model / loadout) sit slightly
 *  smaller, since they never grow in number. */
const ANCHOR = 92

function Group({
  title, summary, accent, expanded, onToggle, children, collapsible = true,
}: {
  title: string
  /** Shown next to the title, and alone when collapsed. */
  summary?: React.ReactNode
  accent?: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
  collapsible?: boolean
}): React.ReactElement {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8, padding: 8,
      background: C.panelAlt, minWidth: 0,
    }}>
      <div
        onClick={() => { if (collapsible) onToggle() }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          cursor: collapsible ? 'pointer' : 'default', userSelect: 'none',
        }}
      >
        {collapsible && (
          <span style={{ color: C.dim, fontSize: '0.7rem', width: 8 }}>
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span style={{
          fontSize: '0.7rem', letterSpacing: 1, color: accent ?? C.dim,
        }}>
          {title}
        </span>
        {summary !== undefined && (
          <span style={{ fontSize: '0.7rem', color: C.dim }}>{summary}</span>
        )}
      </div>
      {expanded && children}
    </div>
  )
}

export function EnginePanel({ G, ragButton }: {
  G: MCState
  /** The "advance RAG" control, supplied by the Board (it owns pitch state). */
  ragButton?: React.ReactNode
}): React.ReactElement {
  const framework = getFramework(G.frameworkId)
  const model = getModel(G.installedModelId)

  // Subsystems start collapsed until they hold something, so an early-round
  // board isn't three empty boxes.
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const isOpen = (key: string, fallback: boolean) => open[key] ?? fallback
  const toggle = (key: string, fallback: boolean) =>
    setOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? fallback) }))

  const ragDone = G.rag.chaptersComplete
  const ragLive = ragDone > RAG_UPSERT_INDEX

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Framework ─────────────────────────────────────────────────── */}
        <Group
          title="FRAMEWORK"
          accent={G.frameworkFreeAgentUsed ? undefined : C.accent}
          expanded={isOpen('framework', true)}
          onToggle={() => toggle('framework', true)}
          summary={G.frameworkFreeAgentUsed ? 'spent' : `free ${framework.freeTrait}`}
        >
          <CardFace
            cardId={G.frameworkId}
            label={framework.name}
            width={ANCHOR}
            dimmed={G.frameworkFreeAgentUsed}
            ring={G.frameworkFreeAgentUsed ? null : C.accent}
          />
          <div style={{
            fontSize: '0.66rem', marginTop: 3, maxWidth: ANCHOR,
            color: G.frameworkFreeAgentUsed ? C.dim : C.accent,
          }}>
            {G.frameworkFreeAgentUsed
              ? 'free Agent used'
              : `free ${framework.freeTrait} available`}
          </div>
        </Group>

        {/* ── Model ─────────────────────────────────────────────────────── */}
        <Group
          title="MODEL"
          expanded={isOpen('model', true)}
          onToggle={() => toggle('model', true)}
          summary={model.name}
        >
          <CardFace cardId={G.installedModelId} label={model.name} width={ANCHOR} />
        </Group>

        {/* ── Loadout, with any Skill attached to each slot ──────────────── */}
        <Group
          title="LOADOUT"
          expanded={isOpen('loadout', true)}
          onToggle={() => toggle('loadout', true)}
          summary={`${G.loadout.length}${G.skillAttachments.length > 0
            ? ` +${G.skillAttachments.length} skill` : ''}`}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {G.loadout.map((id) => {
              const attached = G.skillAttachments.find((a) => a.equipmentId === id)
              return (
                <div key={id}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                    <CardFace cardId={id} label={getEquipment(id).name} width={ANCHOR} />
                    {attached && (
                      <CardFace
                        cardId={attached.skillCardId}
                        label={getOperatorCard(attached.skillCardId).name}
                        width={ANCHOR * 0.72}
                      />
                    )}
                  </div>
                  {attached && (
                    <div style={{ fontSize: '0.62rem', color: C.accent, marginTop: 2 }}>
                      + {getOperatorCard(attached.skillCardId).name} (Durable)
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Group>

        {/* ── Servers: a capability on a face-down substrate ─────────────── */}
        <Group
          title="SERVERS"
          expanded={isOpen('servers', G.servers.length > 0)}
          onToggle={() => toggle('servers', G.servers.length > 0)}
          summary={G.servers.length === 0 ? 'none' : String(G.servers.length)}
        >
          {G.servers.length === 0 ? (
            <div style={{ fontSize: '0.7rem', color: C.dim, maxWidth: 150 }}>
              Install a Tool onto a face-down card to open one.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {G.servers.map((server) => (
                <div key={server.id} style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                  <CardBack
                    deck="operator"
                    width={CARD * 0.55}
                    ring={server.disabled ? C.danger : null}
                  />
                  <CardFace
                    cardId={server.traitCardId}
                    label={getOperatorCard(server.traitCardId).name}
                    width={CARD}
                    dimmed={server.disabled}
                  />
                </div>
              ))}
            </div>
          )}
        </Group>

        {/* ── Claw: face-down loader, then a second hand ─────────────────── */}
        <Group
          title="CLAW"
          accent={G.clawHand.length > 0 ? C.accent : undefined}
          expanded={isOpen('claw', G.clawPile.length > 0 || G.clawHand.length > 0)}
          onToggle={() => toggle('claw', G.clawPile.length > 0 || G.clawHand.length > 0)}
          summary={G.clawHand.length > 0
            ? `complete — ${G.clawHand.length} in hand`
            : `${G.clawPile.length}/${CLAW_COMPLETE_COUNT}`}
        >
          {G.clawPile.length === 0 && G.clawHand.length === 0 ? (
            <div style={{ fontSize: '0.7rem', color: C.dim, maxWidth: 150 }}>
              Feed {CLAW_COMPLETE_COUNT} cards face-down for a second hand.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {G.clawPile.length > 0 && (
                <CardBack
                  deck="operator"
                  width={CARD}
                  count={G.clawPile.length}
                  label={`${G.clawPile.length} loaded`}
                />
              )}
              {G.clawHand.length > 0 && (
                <div style={{ fontSize: '0.7rem', color: C.accent, maxWidth: 120 }}>
                  Complete — the second hand is playable below.
                </div>
              )}
            </div>
          )}
        </Group>

        {/* ── RAG: the setup saga ────────────────────────────────────────── */}
        <Group
          title="RAG"
          accent={ragLive ? C.accent : undefined}
          expanded={isOpen('rag', ragDone > 0)}
          onToggle={() => toggle('rag', ragDone > 0)}
          summary={ragLive ? 'live' : `${ragDone}/${RAG_CHAPTERS.length}`}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: '0.7rem', lineHeight: 1.7 }}>
              {RAG_CHAPTERS.map((chapter, ix) => {
                const done = ix < ragDone
                const optional = ix === RAG_RERANK_INDEX
                return (
                  <div
                    key={chapter.key}
                    style={{ color: done ? C.accent : C.dim, whiteSpace: 'nowrap' }}
                  >
                    {done ? '●' : '○'} {chapter.name}{' '}
                    <span style={{ opacity: 0.7 }}>
                      {PIP_GLYPH[chapter.cost] ?? chapter.cost}
                      {optional ? ' (optional)' : ''}
                    </span>
                  </div>
                )
              })}
              {ragButton && <div style={{ marginTop: 6 }}>{ragButton}</div>}
            </div>

            {/* The Upsert payload IS what a call to RAG contributes. */}
            {G.rag.upsertCardId && (
              <div>
                <CardFace
                  cardId={G.rag.upsertCardId}
                  label={getOperatorCard(G.rag.upsertCardId).name}
                  width={CARD}
                  ring={ragLive ? C.accent : null}
                />
                <div style={{ fontSize: '0.66rem', marginTop: 3 }}>
                  <span style={{ color: C.dim }}>payload </span>
                  {G.rag.contribution.map((contrib, i) => (
                    <span key={i} style={{ color: COLOR_SWATCH[contrib.color], marginRight: 2 }}>
                      {SHAPE_GLYPH[contrib.shape]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Group>
      </div>

      {/* Round Pool — spent this round, so it sits apart from the apparatus. */}
      <div style={{ ...panel, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: '0.7rem', color: C.dim, letterSpacing: 1 }}>ROUND POOL</span>
        <span style={{ fontSize: '1.05rem', color: C.warn, letterSpacing: 3 }}>
          {(['capital', 'attention', 'technology', 'generic'] as const)
            .flatMap((pip) => Array(G.roundPool[pip]).fill(PIP_GLYPH[pip]))
            .join('') || '—'}
        </span>
      </div>
    </div>
  )
}
