/**
 * React context carrying the imported deck's card catalog (`envelope.cards`).
 *
 * Boards consume this to look up names / images / stats by cardId without
 * having to plumb the catalog through props. Stays in the framework layer
 * (no game-specific imports) — the value is just `Record<cardId, anyCardRecord>`.
 *
 * Defaults to an empty map so consumers don't have to null-check (lookups
 * just return `undefined`).
 */
import * as React from 'react'
import { resolveCardImageUrl } from './cardImages'

export type CardCatalog = Record<string, Record<string, unknown>>

const CardCatalogContext = React.createContext<CardCatalog>({})

export function CardCatalogProvider({
  value,
  children,
}: {
  value: CardCatalog
  children: React.ReactNode
}): React.ReactElement {
  return (
    <CardCatalogContext.Provider value={value}>
      {children}
    </CardCatalogContext.Provider>
  )
}

/** Look up a single card record by id. Returns undefined if the id isn't
 *  in the catalog (e.g. a state cardId from a different deck). */
export function useCard(cardId: string | null | undefined): Record<string, unknown> | undefined {
  const catalog = React.useContext(CardCatalogContext)
  if (!cardId) return undefined
  return catalog[cardId]
}

/** Convenience: card's display name, falling back to its id. */
export function useCardName(cardId: string | null | undefined): string {
  const card = useCard(cardId)
  if (!cardId) return ''
  if (card && typeof card.name === 'string') return card.name
  return cardId
}

/** Convenience: card's resolved image URL (relative imagePath +
 *  configured base; see framework/cardImages.ts). Undefined if not in
 *  catalog or no imagePath. */
export function useCardImage(cardId: string | null | undefined): string | undefined {
  const card = useCard(cardId)
  if (!card) return undefined
  if (typeof card.imagePath !== 'string') return undefined
  return resolveCardImageUrl(card.imagePath)
}

/** Hook for components that need the whole catalog (e.g. to count). */
export function useCardCatalog(): CardCatalog {
  return React.useContext(CardCatalogContext)
}

/** Read an arbitrary field off a card record. Returns undefined if the
 *  card isn't in the catalog or the field isn't set. Handy for printed
 *  stats (cost, mil, pol, glory, …). */
export function useCardField<T = unknown>(
  cardId: string | null | undefined,
  field: string,
): T | undefined {
  const card = useCard(cardId)
  if (!card) return undefined
  return card[field] as T | undefined
}
