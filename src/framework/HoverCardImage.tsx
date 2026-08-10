/**
 * Centralized "hover any card to see its full image" overlay.
 *
 * Mount HoverCardImageProvider once near the top of the app. Card
 * tiles call useSetHoveredCard()(cardId) on mouseenter and (null) on
 * mouseleave. After the cursor LINGERS (HOVER_DELAY_MS) the provider
 * renders a fixed-position image preview in the TOP-RIGHT corner — out
 * of the way of the cards you're clicking, and only on a deliberate
 * hover (a quick pass to click never pops it).
 *
 * Why centralized vs. a popover per tile:
 *   - There's only ever one hover at a time, so one overlay is
 *     enough (and avoids z-index / clipping fights with each tile's
 *     container).
 *   - The image renders at full visible size — would never fit
 *     anchored to the tile.
 *   - Tiles stay tiny + focused on their state (bowed / fate / etc.);
 *     hover for the full card art is a separate concern.
 *
 * `pointer-events: none` on the overlay means hover-over-the-image
 * never triggers leave on the original tile — the preview hides as
 * soon as the cursor leaves the source tile.
 *
 * Image URL resolution: uses the same useCardImage hook that the
 * playmat tiles use, so localStorage overrides + the
 * leading-slash-relative-to-origin rules apply uniformly.
 */
import * as React from 'react'
import { useCardImage, useCard } from './CardCatalogContext'

/** How long the cursor must linger on a card before its art appears, so a
 *  quick pass (e.g. moving to CLICK a dynasty card) never pops the preview. */
const HOVER_DELAY_MS = 500

interface HoverCardContextValue {
  setHoveredCardId: (id: string | null) => void
}

const HoverCardContext = React.createContext<HoverCardContextValue>({
  setHoveredCardId: () => { /* default no-op */ },
})

/** Mount once near the top of the app. Renders its children, plus the
 *  hover-image overlay layer when a card is being hovered. */
export function HoverCardImageProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const showTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable callback so children don't re-subscribe on every render.
  // SHOW is debounced by HOVER_DELAY_MS (only fires if the cursor lingers);
  // HIDE (id === null) is immediate. Centralizing the delay here means every
  // hover surface — card tiles, prompt rows, etc. — gets it uniformly.
  const setHoveredCardId = React.useCallback((id: string | null) => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    if (id === null) {
      setHoveredId(null)
    } else {
      showTimer.current = setTimeout(() => setHoveredId(id), HOVER_DELAY_MS)
    }
  }, [])

  // Cancel any pending show on unmount.
  React.useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current)
  }, [])

  return (
    <HoverCardContext.Provider value={{ setHoveredCardId }}>
      {children}
      <HoverCardImageOverlay cardId={hoveredId} />
    </HoverCardContext.Provider>
  )
}

/** Hook a card tile uses to register hover handlers. Typical pattern:
 *
 *    const setHovered = useSetHoveredCard()
 *    <div onMouseEnter={() => setHovered(cardId)}
 *         onMouseLeave={() => setHovered(null)}> … </div>
 *
 *  Returns a stable function — safe to put in deps arrays. */
export function useSetHoveredCard(): (id: string | null) => void {
  return React.useContext(HoverCardContext).setHoveredCardId
}

/** Convenience: returns the props you can spread onto a card tile
 *  to wire hover-preview behavior in one line. */
export function useHoverCardProps(cardId: string | null | undefined): {
  onMouseEnter: () => void
  onMouseLeave: () => void
} {
  const setHovered = useSetHoveredCard()
  return {
    onMouseEnter: () => setHovered(cardId ?? null),
    onMouseLeave: () => setHovered(null),
  }
}

/** Turn a card's printed `text` (HTML + [symbol] codes + \n line breaks) into
 *  plain multi-line text for the hover aid box. Not a full HTML renderer — just
 *  enough to read the rules cleanly:
 *   - <br> → newline; all other tags stripped (the <b>/<em> emphasis is lost,
 *     but the keyword colon — "Action:" — keeps it scannable).
 *   - [element-air] / [conflict-military] / [clan-phoenix] → [air] / [military]
 *     / [phoenix] (drop the qualifier prefix, keep the meaningful tail).
 *   - common HTML entities decoded; numeric refs (e.g. the unique &#59662;
 *     bullet) dropped.
 *   - collapse 3+ blank lines. */
function formatCardText(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return ''
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([\w-]+)\]/g, (_m, code: string) => `[${code.split('-').pop()}]`)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[lr]dquo;/g, '"')
    .replace(/&[nm]dash;/g, '–')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Compact "name · Type · cost" + stat line shown above the rules text. */
function cardHeader(card: Record<string, unknown> | undefined): { title: string; sub: string } {
  if (!card) return { title: '', sub: '' }
  const name = typeof card.name === 'string' ? card.name : ''
  const type = typeof card.type === 'string' ? card.type : ''
  const parts: string[] = []
  if (type) parts.push(type)
  if (card.cost != null) parts.push(`cost ${card.cost}`)
  const stat = (k: string, label: string) => {
    const v = card[k]
    if (v != null && v !== '') parts.push(`${label} ${v}`)
  }
  stat('military', '⚔'); stat('political', '☰'); stat('glory', '✦'); stat('strength', '🛡')
  if (Array.isArray(card.traits) && card.traits.length) parts.push(card.traits.join(' · '))
  return { title: name, sub: parts.join('  ·  ') }
}

function HoverCardImageOverlay({ cardId }: { cardId: string | null }): React.ReactElement | null {
  const imageUrl = useCardImage(cardId)
  const card = useCard(cardId)
  if (!cardId) return null

  const text = formatCardText(card?.text)
  const { title, sub } = cardHeader(card)
  // Show the aid box (#6 "text aid on hover as translucent text boxes") whenever
  // we have any printed text — especially valuable when the card IMAGE can't load
  // (tcgdb host unreachable), which is exactly when the player most needs the rules.
  const showAid = !!text || !!title
  if (!imageUrl && !showAid) return null

  return (
    // Anchored to the TOP-RIGHT corner (not centered + dimmed) so the preview
    // never sits on top of the card you're trying to click — fixes "can't play
    // dynasty cards because the image blocks them". pointer-events: none means
    // it never intercepts the cursor, so the card under it stays live and the
    // preview hides as soon as the cursor leaves the source tile.
    <div
      style={{
        position: 'fixed',
        top: 56,
        right: 12,
        pointerEvents: 'none',
        zIndex: 1600,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        maxWidth: 'min(42vw, 340px)',
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{
            display: 'block',
            maxHeight: '62vh',
            maxWidth: '100%',
            borderRadius: 10,
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.85), 0 0 0 2px rgba(255, 255, 255, 0.10)',
          }}
        />
      )}
      {showAid && (
        <div
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(12, 12, 14, 0.82)',
            backdropFilter: 'blur(2px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: 8,
            padding: '8px 10px',
            color: '#eaeaea',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          }}
        >
          {title && (
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: sub ? 2 : 4 }}>
              {title}
            </div>
          )}
          {sub && (
            <div style={{ fontSize: '0.66rem', color: '#9aa', marginBottom: text ? 6 : 0 }}>
              {sub}
            </div>
          )}
          {text && (
            <div style={{ fontSize: '0.72rem', lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
              {text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
