/**
 * CardLink — an inline-clickable card name that shows a hover popover
 * with the card's printed details. Used by the L5R move log + any
 * other surface that wants click-to-inspect.
 *
 * Behavior:
 *   - Renders the resolved card name as underlined text.
 *   - On hover (mouseenter) the popover opens. On mouseleave it
 *     closes — unless the user clicked to PIN it open.
 *   - Click toggles the pinned state. A pinned popover stays open
 *     until clicked again or until the user clicks outside.
 *   - Reads card fields via the framework CardCatalogContext, so it
 *     works for any game's cards as long as the catalog is mounted.
 *
 * Positioning: absolute, anchored above (or below if there isn't
 * room) the link. Simple coordinate math — no portal needed because
 * z-index 1700 sits above all our overlays (game-over modal: 1450,
 * pass-device: 1500; let me know if those grow).
 */
import * as React from 'react'
import { useCardCatalog } from './CardCatalogContext'

interface CardLinkProps {
  cardId: string
  /** Override the displayed text. Defaults to the catalog name. */
  children?: React.ReactNode
}

export function CardLink({ cardId, children }: CardLinkProps): React.ReactElement {
  const catalog = useCardCatalog()
  const card = catalog[cardId] ?? null
  const name = (card?.name as string | undefined) ?? cardId
  const [hover, setHover] = React.useState(false)
  const [pinned, setPinned] = React.useState(false)
  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const open = hover || pinned

  // Close pinned popover on outside click.
  React.useEffect(() => {
    if (!pinned) return
    function onDocClick(e: MouseEvent): void {
      if (!anchorRef.current) return
      if (anchorRef.current.contains(e.target as Node)) return
      // Also check the popover — it lives outside the anchor, so
      // walk up the popover's data-card-link-popover marker.
      let n: HTMLElement | null = e.target as HTMLElement
      while (n) {
        if (n.dataset?.cardLinkPopover === cardId) return
        n = n.parentElement
      }
      setPinned(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pinned, cardId])

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <span
        ref={anchorRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation()
          setPinned((p) => !p)
        }}
        style={{
          color: '#a9c3d8',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          cursor: 'pointer',
        }}
      >
        {children ?? name}
      </span>
      {open && card && (
        <CardPopover
          cardId={cardId}
          card={card}
          name={name}
          pinned={pinned}
          onUnpin={() => setPinned(false)}
        />
      )}
    </span>
  )
}

function CardPopover({
  cardId, card, name, pinned, onUnpin,
}: {
  cardId: string
  card: Record<string, unknown>
  name: string
  pinned: boolean
  onUnpin: () => void
}): React.ReactElement {
  const type = card.type as string | undefined
  const cost = card.cost as number | string | undefined
  const mil  = card.military as number | string | undefined
  const pol  = card.political as number | string | undefined
  const glory = card.glory as number | string | undefined
  const strength = card.strength as number | string | undefined
  const milBonus = card.militaryBonus as number | string | undefined
  const polBonus = card.politicalBonus as number | string | undefined
  const traits = Array.isArray(card.traits) ? card.traits as string[] : []
  const text = card.text as string | undefined
  const clan = card.clan as string | undefined
  const keywords = Array.isArray(card.keywords) ? card.keywords as string[] : []

  return (
    <span
      data-card-link-popover={cardId}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        left: 0,
        zIndex: 1700,
        background: '#1a1a1a',
        border: '1px solid #444',
        borderRadius: 6,
        padding: 10,
        minWidth: 260,
        maxWidth: 360,
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        color: '#eaeaea',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.78rem',
        lineHeight: 1.35,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ color: '#a9c3d8', fontSize: '0.92rem' }}>{name}</strong>
        {pinned && (
          <button
            onClick={onUnpin}
            title="Unpin popover"
            style={{
              background: 'transparent',
              color: '#888',
              border: '1px solid #444',
              borderRadius: 3,
              padding: '0 5px',
              fontSize: '0.65rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ opacity: 0.65, marginBottom: 6, fontSize: '0.7rem' }}>
        {type ?? '?'}{clan ? ` · ${clan}` : ''}{cost !== undefined ? ` · cost ${cost}` : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, fontSize: '0.72rem' }}>
        {mil !== undefined && <span>⚔ {mil}</span>}
        {pol !== undefined && <span>📜 {pol}</span>}
        {glory !== undefined && <span>★ {glory}</span>}
        {strength !== undefined && <span>🛡 {strength}</span>}
        {milBonus !== undefined && <span style={{ color: '#7fd1a2' }}>⚔ bonus {milBonus}</span>}
        {polBonus !== undefined && <span style={{ color: '#7fd1a2' }}>📜 bonus {polBonus}</span>}
      </div>
      {traits.length > 0 && (
        <div style={{ marginBottom: 6, opacity: 0.75, fontStyle: 'italic', fontSize: '0.7rem' }}>
          {traits.join(' · ')}
        </div>
      )}
      {keywords.length > 0 && (
        <div style={{ marginBottom: 6, fontSize: '0.65rem' }}>
          {keywords.map((k) => (
            <span
              key={k}
              style={{
                display: 'inline-block',
                background: '#243',
                color: '#7fd1a2',
                border: '1px solid #555',
                padding: '0 5px',
                marginRight: 4,
                marginBottom: 2,
                borderRadius: 3,
                textTransform: 'capitalize',
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {text && (
        <div
          style={{ borderTop: '1px solid #2a2a2a', paddingTop: 6, color: '#ddd', fontSize: '0.72rem' }}
          // Card text often contains <b>, <i>, <em> tags from the
          // tcgdb scrape. Rendering as text loses formatting; sanitize
          // by allowlisting these tags would be ideal. For now render
          // as innerHTML — the catalog is local-trusted (player-
          // assets/) so XSS isn't a real risk.
          dangerouslySetInnerHTML={{ __html: text }}
        />
      )}
    </span>
  )
}
