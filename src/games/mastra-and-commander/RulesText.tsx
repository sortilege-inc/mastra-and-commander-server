/**
 * Renders a card's rules text.
 *
 * Rules text uses the printed mini-syntax (design §6): `**bold**` for keywords.
 * React renders strings literally, so without this the board showed the
 * asterisks — `**Response:** remove up to 2…`.
 *
 * It also expands the legacy `{coin}` / `{eye}` / `{gear}` / `{blank}` icon
 * tokens into their bolded resource NAMES ("capital", "attention",
 * "technology", "generic"), per the owner's 2026-08-10 call: on screen the word
 * reads better than a glyph, and the glyph only ever made sense on the printed
 * face where the icon art exists. Card data should be written with the words
 * directly; this is a safety net for any token that slips through (e.g. text
 * transcribed from `cards.yml`).
 */
import * as React from 'react'

/** Printed icon token -> the resource it denotes. */
const TOKEN_WORD: Record<string, string> = {
  coin: 'capital',
  eye: 'attention',
  gear: 'technology',
  blank: 'generic',
}

/** Splits on **bold** runs and {token}s, keeping the delimiters. */
const SEGMENT = /(\*\*[^*]+\*\*|\{[a-z]+\})/g

export function RulesText({ text, style }: {
  text: string
  style?: React.CSSProperties
}): React.ReactElement {
  const parts = text.split(SEGMENT).filter((part) => part !== '')

  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('{') && part.endsWith('}')) {
          const word = TOKEN_WORD[part.slice(1, -1)]
          // An unknown token is left verbatim rather than silently dropped —
          // better a visible oddity than text that quietly loses meaning.
          return word ? <strong key={i}>{word}</strong> : <span key={i}>{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}
