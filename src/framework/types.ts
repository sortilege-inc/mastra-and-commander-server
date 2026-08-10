/**
 * Game-agnostic types shared across the framework.
 *
 * Per the project CLAUDE.md: framework code must NOT import from any
 * specific game's directory; per-game code registers itself by
 * implementing GameRegistration.
 */
import type { Game } from 'boardgame.io'
import type * as React from 'react'
import type { BoardProps } from 'boardgame.io/react'

/** A format / mode the user can pick within a given game (e.g. for L5R:
 *  "stronghold", "skirmish"). */
export interface FormatRegistration {
  id: string
  name: string
  description?: string
  /** If true, this format isn't ready to play yet; selectable but
   *  greyed out in the picker. */
  comingSoon?: boolean
}

/** One game's contribution to the framework. Per-game code at
 *  `src/games/<game-id>/index.ts` exports one of these. */
export interface GameRegistration<G = unknown> {
  /** Stable identifier used by storage + URLs. */
  id: string
  /** Display name. */
  name: string
  /** Browser tab title (document.title) once this game is selected.
   *  Defaults to `name` when omitted — lets the tab read a fuller title
   *  than the compact select-screen name. */
  documentTitle?: string
  /** Short tagline shown under the name in the game-select screen. */
  tagline?: string
  /** Available formats for this game. The user picks one before play. */
  formats: FormatRegistration[]
  /** boardgame.io game definition. Pure data + move handlers. */
  game: Game<G>
  /** React component that renders the game state. */
  board: React.ComponentType<BoardProps<G>>
  /** Number of players the game needs. */
  numPlayers: number
  /** Identity of this game's AI opponent policy (e.g.
   *  `"sensei+lookahead(W=15,K=5)"`), stamped — together with the app version —
   *  into recorded transcripts so training data records WHICH bot played.
   *  Omit for games with no AI. */
  botPolicyId?: string
  /** Take the game's freshly-built initial state and an ordered list of
   *  validated deck exports (one per player; envelopes[0] → player '0',
   *  envelopes[1] → player '1'), return the customized initial state.
   *  Called by the framework during Client construction once the user
   *  has imported their decks.
   *
   *  Length 1 = solo / single-player demo; length 2 = hotseat (two
   *  players sharing the device). Optional: games that don't model
   *  decks (e.g. TicTacToe) can omit it. */
  applyDeckExport?: (state: G, envelopes: DeckExport[]) => G
  /** Optional async hook called by the framework between deck-import and
   *  Client construction. Receives the same envelope list applyDeckExport
   *  will receive. Used by games that lazy-load card-impl modules or
   *  other per-deck assets. Returns a report so the framework can
   *  surface "X of Y cards have engine support" before starting.
   *
   *  When `applyDeckExport` is set but `preloadDeck` is not, the framework
   *  skips preload entirely and the game starts immediately. */
  preloadDeck?: (envelopes: DeckExport[]) => Promise<{
    /** Cards that have engine-side support (modules / behavior). */
    loaded: string[]
    /** Cards in the imported deck(s) that have no engine-side impl —
     *  will be treated as "manual mode" during play. */
    missing: string[]
  }>
}

/** The deck-export envelope tcgdb produces. Defined here so the framework
 *  can validate the shape before handing off to a per-game parser.
 *  See ../../CLAUDE.md for the canonical shape. */
export interface DeckExport {
  exportVersion: 1
  exportedAt: string
  deck: {
    id: string
    gameId: string
    formatId: string
    name: string
    splashClan?: string
    zones: Record<string, Array<{ cardId: string; qty: number }>>
    enforceErrata?: boolean
    notes?: string
  }
  cards: Record<string, Record<string, unknown>>
}
