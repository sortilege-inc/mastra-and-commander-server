/**
 * Renders a card's printed face — the Squib-rendered art from the sibling
 * design repo, served out of `public/cards/<cardId>.webp`.
 *
 * The images are the SAME artifacts the print pipeline produces (rendered by
 * `../mastra-and-commander/cards/deck.rb`), just downscaled to 600px wide and
 * converted to WebP for the web. This repo does NOT own or generate card art —
 * see CLAUDE.md. Re-export from the design repo to refresh them.
 *
 * Two things make this safe to drop in anywhere:
 *  - **It degrades.** A missing or broken image falls back to a text plate, so
 *    a card the artist hasn't drawn yet still plays.
 *  - **It zooms.** At hand size the printed rails and rules text are far too
 *    small to read, so hovering shows the full card at a legible size. That's
 *    what keeps the face from being decoration.
 */
import * as React from 'react'
import { C } from './theme'

/** Card faces are 825×1125 in the print pipeline. */
const CARD_ASPECT = 1125 / 825

/** Width of the hover preview, in px. Enough to read the rules panel. */
const PREVIEW_WIDTH = 400

export function cardArtUrl(cardId: string): string {
  return `${import.meta.env.BASE_URL}cards/${cardId}.webp`
}

export function CardFace({
  cardId, label, width, dimmed = false, ring = null, zoom = true,
}: {
  cardId: string
  /** Shown if the art is missing, and as the image's alt text. */
  label: string
  width: number
  /** Wash the card out (subverted, spent, unavailable). */
  dimmed?: boolean
  /** Highlight colour for a state ring (pitched, relayed, …). */
  ring?: string | null
  /** Set false where a preview would be in the way (inside overlays). */
  zoom?: boolean
}): React.ReactElement {
  const [broken, setBroken] = React.useState(false)
  const [hover, setHover] = React.useState<{ x: number; y: number } | null>(null)
  const height = Math.round(width * CARD_ASPECT)

  const frame: React.CSSProperties = {
    width, height, borderRadius: 8, overflow: 'hidden', position: 'relative',
    border: `2px solid ${ring ?? 'transparent'}`,
    opacity: dimmed ? 0.55 : 1,
    filter: dimmed ? 'grayscale(0.6)' : undefined,
    background: C.panelAlt,
    flexShrink: 0,
  }

  if (broken) {
    return (
      <div style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          fontSize: '0.72rem', color: C.dim, textAlign: 'center', padding: 6,
        }}>
          {label}
          <div style={{ fontSize: '0.62rem', opacity: 0.7, marginTop: 4 }}>no art</div>
        </span>
      </div>
    )
  }

  // Clamp the preview inside the viewport so cards near an edge stay readable.
  const previewHeight = Math.round(PREVIEW_WIDTH * CARD_ASPECT)
  const previewPos = hover ? {
    left: Math.min(hover.x + 16, window.innerWidth - PREVIEW_WIDTH - 12),
    top: Math.min(Math.max(hover.y - previewHeight / 2, 8),
      window.innerHeight - previewHeight - 8),
  } : null

  return (
    <>
      <div
        style={frame}
        onMouseEnter={(e) => { if (zoom) setHover({ x: e.clientX, y: e.clientY }) }}
        onMouseMove={(e) => { if (zoom && hover) setHover({ x: e.clientX, y: e.clientY }) }}
        onMouseLeave={() => setHover(null)}
      >
        <img
          src={cardArtUrl(cardId)}
          alt={label}
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {previewPos && (
        <div style={{
          position: 'fixed', ...previewPos, zIndex: 60, pointerEvents: 'none',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.75)',
        }}>
          <img
            src={cardArtUrl(cardId)}
            alt=""
            style={{ width: PREVIEW_WIDTH, display: 'block' }}
          />
        </div>
      )}
    </>
  )
}

/**
 * The uniform back of a card.
 *
 * Face-down play is load-bearing here (server substrates, the Claw, calls), and
 * the two-deck model exists precisely so backs are uniform WITHIN a deck — a
 * face-down Operator card must be indistinguishable from any other. The two
 * decks are distinguishable from EACH OTHER (ice vs. fractured red), which is
 * fine: nobody has to guess which deck a card came from.
 *
 * So this renders the deck's back and nothing else — never the card's identity.
 */
export function CardBack({
  deck, width, label, ring = null, count,
}: {
  deck: 'operator' | 'entropy'
  width: number
  /** Optional caption UNDER the card — never printed on the back itself. */
  label?: string
  ring?: string | null
  /** Render as a stack of this many cards (visual only; clamped). */
  count?: number
}): React.ReactElement {
  const [broken, setBroken] = React.useState(false)
  const height = Math.round(width * CARD_ASPECT)
  // Peeking edges behind the top card, so a stack reads as depth at a glance.
  const layers = Math.min(Math.max((count ?? 1) - 1, 0), 4)
  const accent = deck === 'entropy' ? C.danger : C.accent

  const face: React.CSSProperties = {
    width, height, borderRadius: 8, overflow: 'hidden',
    border: `2px solid ${ring ?? 'transparent'}`,
    background: broken
      ? `repeating-linear-gradient(45deg, ${C.panel} 0 6px, ${C.panelAlt} 6px 12px)`
      : C.panelAlt,
    position: 'relative',
  }

  return (
    <div style={{ width: width + layers * 3, flexShrink: 0 }}>
      <div style={{ position: 'relative', height: height + layers * 3 }}>
        {Array.from({ length: layers }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', left: (layers - i) * 3, top: (layers - i) * 3,
            width, height, borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.panel,
          }} />
        ))}
        <div style={{ ...face, position: 'absolute', left: 0, top: 0 }}>
          {!broken && (
            <img
              src={`${import.meta.env.BASE_URL}cards/back-${deck}.webp`}
              alt={`${deck} card back`}
              onError={() => setBroken(true)}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          )}
        </div>
      </div>
      {label && (
        <div style={{ fontSize: '0.68rem', color: accent, marginTop: 3 }}>{label}</div>
      )}
    </div>
  )
}
