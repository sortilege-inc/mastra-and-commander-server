/**
 * App shell.
 *
 * Flow:
 *   1. GameSelect          — pick game + format
 *   2. DeckImport (P1)     — first deck (skipped for games without
 *                            applyDeckExport, e.g. TicTacToe)
 *   3. SecondDeckPrompt    — "Add a second deck for hotseat play, or
 *                            start solo?"
 *   4. DeckImport (P2)     — only if "Add second deck"
 *   5. Preloading…         — registration.preloadDeck runs against the
 *                            full envelope list
 *   6. Game (Client+Board) — boardgame.io Client mounts with the
 *                            customized setup() that applies the deck
 *                            exports for both players
 *
 * Per the project CLAUDE.md: this file lives in the framework layer. It
 * does NOT import from any specific game's directory — only via the
 * registry. Adding a new game = adding to `src/framework/registry.ts`.
 *
 * Hook discipline: every React hook below is called at the top level
 * unconditionally so the call order is stable across renders. Conditional
 * branching only happens *after* all hooks have run.
 */
import * as React from 'react'
import type { Game } from 'boardgame.io'
import { Client } from 'boardgame.io/react'
import { GameSelect } from './framework/GameSelect'
import { DeckImport } from './framework/DeckImport'
import { SecondDeckPrompt } from './framework/SecondDeckPrompt'
import { autoStartChoice, findGame } from './framework/registry'
import { loadGameChoice, saveGameChoice, clearGameChoice, shouldRecordTranscript } from './framework/storage'
import type { GameMode } from './framework/storage'
import { GameModeProvider } from './framework/ModeContext'
import { beginTranscript, discardTranscript } from './framework/replayTranscript'
import { SwitchGameProvider } from './framework/SwitchGameContext'
import { CardCatalogProvider } from './framework/CardCatalogContext'
import { HoverCardImageProvider } from './framework/HoverCardImage'
import type { DeckExport } from './framework/types'
import type { SavedGame } from './framework/savedGame'

interface ActiveChoice {
  gameId: string
  formatId: string
  mode: GameMode
}

interface PreloadReport {
  loaded: string[]
  missing: string[]
}

/** Steps through the deck-import flow. */
type DeckFlow =
  | { kind: 'collect-first' }
  | { kind: 'ask-second'; first: DeckExport }
  | { kind: 'collect-second'; first: DeckExport }
  | { kind: 'ready'; envelopes: DeckExport[] }

export function App(): React.ReactElement {
  // A visitor with no stored preference drops straight into the registry's
  // auto-start game (see framework/registry.ts) instead of the picker. A stored
  // choice still wins, so someone who deliberately switched games keeps it.
  //
  // This initializer runs once per mount, so "Switch game" — which clears the
  // choice — reaches the picker rather than being re-filled by auto-start.
  const [choice, setChoice] = React.useState<ActiveChoice | null>(
    () => loadGameChoice() ?? autoStartChoice(),
  )
  const [deckFlow, setDeckFlow] = React.useState<DeckFlow>({ kind: 'collect-first' })
  const [preload, setPreload] = React.useState<PreloadReport | 'loading' | null>(null)
  /** B3: when a SavedGame is loaded via the LoadGameButton, hold it
   *  here. App.tsx then bypasses the deck-flow and hands the live G
   *  to the bg.io Client via a setup override. */
  const [loadedSnapshot, setLoadedSnapshot] = React.useState<SavedGame | null>(null)

  const resetDeckFlow = React.useCallback(() => {
    setDeckFlow({ kind: 'collect-first' })
    setPreload(null)
    setLoadedSnapshot(null)
  }, [])

  const switchGame = React.useCallback(() => {
    clearGameChoice()
    setChoice(null)
    resetDeckFlow()
  }, [resetDeckFlow])

  const backToGameSelect = React.useCallback(() => {
    clearGameChoice()
    setChoice(null)
    resetDeckFlow()
  }, [resetDeckFlow])

  const registration = choice ? findGame(choice.gameId) : null
  const format = registration && choice
    ? registration.formats.find((f) => f.id === choice.formatId) ?? registration.formats[0] ?? null
    : null

  const envelopes = deckFlow.kind === 'ready' ? deckFlow.envelopes : null

  // Per-game RNG seed. Memoized with the same deps as `effectiveGame`
  // so a single game has one stable seed. Stamped into the Game
  // definition (bg.io reads it for its random source) and the
  // transcript header (for the replay verifier).
  const gameSeed = React.useMemo(() => {
    if (!registration) return null
    try {
      const u = crypto.randomUUID?.()
      if (u) return u
    } catch { /* fall through */ }
    return `seed-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }, [registration, envelopes, loadedSnapshot])

  // Build a customized game from the registration + envelopes. Stays
  // null until envelopes is non-null (i.e. deck flow is 'ready') OR a
  // saved snapshot is loaded. The per-game seed lives on the Game
  // (bg.io reads `game.seed`), not the Client constructor.
  const effectiveGame = React.useMemo<Game | null>(() => {
    if (!registration) return null
    // Load path takes precedence — bypass applyDeckExport entirely.
    if (loadedSnapshot && loadedSnapshot.gameId === registration.id) {
      return {
        ...registration.game,
        seed: gameSeed ?? undefined,
        setup: () => loadedSnapshot.G,
      } as Game
    }
    if (!registration.applyDeckExport || !envelopes) {
      return {
        ...registration.game,
        seed: gameSeed ?? undefined,
      } as Game
    }
    const baseSetup = registration.game.setup
    return {
      ...registration.game,
      seed: gameSeed ?? undefined,
      setup: (ctx, setupData) => {
        const initial = baseSetup ? baseSetup(ctx, setupData) : ({} as unknown)
        return registration.applyDeckExport!(initial as never, envelopes)
      },
    } as Game
  }, [registration, envelopes, loadedSnapshot, gameSeed])

  const GameClient = React.useMemo(
    () =>
      registration && effectiveGame
        ? Client({
            game: effectiveGame,
            board: registration.board,
            numPlayers: registration.numPlayers,
          })
        : null,
    [registration, effectiveGame]
  )

  React.useEffect(() => {
    if (choice && !registration) {
      clearGameChoice()
      setChoice(null)
      resetDeckFlow()
    }
  }, [choice, registration, resetDeckFlow])

  // Browser tab title: once a game is selected, show that game's
  // documentTitle (falling back to its name); on the game-select screen,
  // restore the default title captured from index.html at first mount.
  const baseTitle = React.useRef(
    typeof document !== 'undefined' ? document.title : '',
  ).current
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = choice && registration
      ? (registration.documentTitle ?? registration.name)
      : baseTitle
  }, [choice, registration, baseTitle])

  // Replay transcript: begin recording once the deck flow is ready
  // and the GameClient is about to mount. The Board records moves and
  // the outcome; this hook just opens the transcript with deck metadata.
  // Snapshot-loaded games don't get a transcript (we don't have the
  // original deck export envelopes for them).
  React.useEffect(() => {
    if (!choice || !registration) return
    if (!envelopes || envelopes.length === 0) return
    if (loadedSnapshot) return
    if (!shouldRecordTranscript(choice.mode)) {
      discardTranscript()
      return
    }
    beginTranscript({
      gameId: choice.gameId,
      format: choice.formatId,
      mode: choice.mode,
      envelopes,
      rngSeed: gameSeed,
      // Training-data provenance: stamp WHICH AI version played. The package
      // version (Vite-injected) uniquely identifies the policy; the bot-policy
      // id makes it human-readable. Only meaningful for Vs-AI games, but
      // harmless to record otherwise.
      senseiVersion: registration.botPolicyId
        ? `${registration.botPolicyId}@${__APP_VERSION__}`
        : `@${__APP_VERSION__}`,
    })
  }, [choice, registration, envelopes, loadedSnapshot, gameSeed])

  // Run preloadDeck whenever envelopes is ready. If the registration
  // doesn't declare preloadDeck, mark immediately complete.
  React.useEffect(() => {
    if (!registration || !envelopes) return
    if (!registration.preloadDeck) {
      setPreload({ loaded: [], missing: [] })
      return
    }
    let cancelled = false
    setPreload('loading')
    registration.preloadDeck(envelopes)
      .then((report) => { if (!cancelled) setPreload(report) })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[App] preloadDeck failed:', e)
        if (!cancelled) setPreload({ loaded: [], missing: [] })
      })
    return () => { cancelled = true }
  }, [registration, envelopes])

  // B3: when a saved snapshot is loaded, preload the cards referenced
  // by its catalog. preloadDeck takes envelopes; synthesize a single
  // envelope from the saved catalog so we can reuse the same path.
  React.useEffect(() => {
    if (!registration || !loadedSnapshot) return
    if (!registration.preloadDeck) {
      setPreload({ loaded: [], missing: [] })
      return
    }
    let cancelled = false
    setPreload('loading')
    const synthEnvelope: DeckExport = {
      exportVersion: 1,
      exportedAt: loadedSnapshot.exportedAt,
      deck: {
        id: 'restore',
        gameId: loadedSnapshot.gameId,
        formatId: loadedSnapshot.formatId ?? 'stronghold',
        name: 'Restored from save',
        splashClan: undefined,
        zones: { stronghold: [], dynasty: [], conflict: [] },
        enforceErrata: false,
        notes: '',
      },
      cards: loadedSnapshot.catalog,
    }
    registration.preloadDeck([synthEnvelope])
      .then((report) => { if (!cancelled) setPreload(report) })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[App] preloadDeck (restore) failed:', e)
        if (!cancelled) setPreload({ loaded: [], missing: [] })
      })
    return () => { cancelled = true }
  }, [registration, loadedSnapshot])

  // ── State 1: no game chosen ──────────────────────────────────────
  // With auto-start on, this is reached only when the user asked for the
  // picker; their pick is saved, so it survives the next visit.
  if (!choice) {
    return (
      <GameSelect
        onChoose={(gameId, formatId, mode) => {
          saveGameChoice({ gameId, formatId, mode })
          setChoice({ gameId, formatId, mode })
          resetDeckFlow()
        }}
      />
    )
  }

  if (!registration || !format) {
    return <LoadingFrame />
  }

  // ── State 2a: collect first deck ────────────────────────────────
  // B3 carve-out: if a saved snapshot is loaded, skip the deck flow
  // entirely and proceed to preload / game.
  //
  // Vs AI mode (per docs/ai-opponent-plan.md Stage AI-A): on import,
  // skip the SecondDeckPrompt and route straight into the second
  // import labelled as the opponent's deck. The bot still needs a
  // deck.
  if (registration.applyDeckExport && !loadedSnapshot && deckFlow.kind === 'collect-first') {
    return (
      <DeckImport
        registration={registration}
        format={format}
        playerNum={1}
        onImport={(env) => {
          if (choice.mode === 'vs-ai') {
            setDeckFlow({ kind: 'collect-second', first: env })
          } else {
            setDeckFlow({ kind: 'ask-second', first: env })
          }
        }}
        onBack={backToGameSelect}
        onLoadSnapshot={setLoadedSnapshot}
      />
    )
  }

  // ── State 2b: ask about a second deck (hotseat only) ────────────
  if (registration.applyDeckExport && !loadedSnapshot && deckFlow.kind === 'ask-second') {
    return (
      <SecondDeckPrompt
        registration={registration}
        format={format}
        firstDeckName={deckFlow.first.deck.name}
        onAddSecond={() => setDeckFlow({ kind: 'collect-second', first: deckFlow.first })}
        onStartSolo={() => setDeckFlow({ kind: 'ready', envelopes: [deckFlow.first] })}
        onBack={() => setDeckFlow({ kind: 'collect-first' })}
      />
    )
  }

  // ── State 2c: collect second deck ───────────────────────────────
  //   - hotseat: framed as Player 2's deck
  //   - vs-ai:   framed as the opponent's deck (Back returns to first
  //              import, since there's no ask-second step in this mode)
  if (registration.applyDeckExport && !loadedSnapshot && deckFlow.kind === 'collect-second') {
    return (
      <DeckImport
        registration={registration}
        format={format}
        playerNum={choice.mode === 'vs-ai' ? 'ai' : 2}
        onImport={(env) => setDeckFlow({
          kind: 'ready',
          envelopes: [deckFlow.first, env],
        })}
        onBack={() => {
          if (choice.mode === 'vs-ai') {
            setDeckFlow({ kind: 'collect-first' })
          } else {
            setDeckFlow({ kind: 'ask-second', first: deckFlow.first })
          }
        }}
      />
    )
  }

  // ── State 2.5: preloading card-impl modules ──────────────────────
  if (registration.preloadDeck && (envelopes || loadedSnapshot)) {
    if (preload === null || preload === 'loading') {
      return <LoadingFrame message={
        loadedSnapshot ? `Restoring ${registration.name}…` : `Loading ${registration.name}…`
      } />
    }
  }

  // ── State 3: game ready ──────────────────────────────────────────
  if (!GameClient) return <LoadingFrame message="Loading…" />

  // The merged catalog for the CardCatalogProvider — union of both
  // envelopes' card maps. When a snapshot is loaded, the saved
  // catalog stands in.
  const mergedCatalog: Record<string, Record<string, unknown>> = {}
  if (loadedSnapshot) {
    Object.assign(mergedCatalog, loadedSnapshot.catalog)
  } else if (envelopes) {
    for (const env of envelopes) {
      for (const [id, rec] of Object.entries(env.cards)) mergedCatalog[id] = rec
    }
  }

  return (
    <SwitchGameProvider value={switchGame}>
      <GameModeProvider mode={choice.mode}>
        <CardCatalogProvider value={mergedCatalog}>
          <HoverCardImageProvider>
            <GameClient playerID="0" />
          </HoverCardImageProvider>
        </CardCatalogProvider>
      </GameModeProvider>
    </SwitchGameProvider>
  )
}

function LoadingFrame({ message }: { message?: string }): React.ReactElement {
  return (
    <div style={{
      padding: 32, color: '#eaeaea', background: '#1a1a1a',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif',
    }}>
      {message ?? 'Loading…'}
    </div>
  )
}
