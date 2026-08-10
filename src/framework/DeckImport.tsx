/**
 * Deck-import screen — step 2 of the launch flow (after GameSelect, before
 * the Board). The user picks one of three paths:
 *
 *   1. Click a deck listed in the per-game manifest
 *      (/player-assets/<gameId>/decks/manifest.json — populated by tcgdb's
 *      export script).
 *   2. Upload a JSON file (the same envelope tcgdb's export produces).
 *   3. Paste JSON text directly.
 *
 * In all cases the envelope is validated via `validateDeckExport`. On
 * success we hand it back to App.tsx via `onImport`. On failure we surface
 * the error inline; the user can pick another deck or fix the JSON.
 *
 * Per CLAUDE.md: framework code only. No imports from `src/games/...`.
 */
import * as React from 'react'
import type { DeckExport, GameRegistration, FormatRegistration } from './types'
import { validateDeckExport } from './validateDeckExport'
import { type SavedGame, parseSavedGame } from './savedGame'

interface ManifestEntry {
  filename: string
  deckId: string
  name: string
  formatId: string
  splashClan?: string
  cardCount: number
  exportedAt: string
}

interface Manifest {
  manifestVersion: 1
  gameId: string
  decks: ManifestEntry[]
}

export interface DeckImportProps {
  registration: GameRegistration
  format: FormatRegistration
  /** Which player slot is being filled.
   *  - `1` = the human host's deck (the first import)
   *  - `2` = the second human's deck in hotseat mode
   *  - `'ai'` = the bot opponent's deck in vs-ai mode
   *  Used to label the heading; the actual playerId assignment happens
   *  later in applyDeckExport (the 'ai' deck still loads into the
   *  P1 slot — it just changes the framing for the human at the
   *  keyboard). */
  playerNum?: 1 | 2 | 'ai'
  onImport: (envelope: DeckExport) => void
  onBack: () => void
  /** B3: when present, the screen surfaces a "Restore a saved game"
   *  affordance. The handler receives a parsed SavedGame and is
   *  expected to set App-level state that bypasses the deck-flow. */
  onLoadSnapshot?: (snapshot: SavedGame) => void
}

const MANIFEST_URL = (gameId: string): string =>
  `/player-assets/${gameId}/decks/manifest.json`

const ENVELOPE_URL = (gameId: string, filename: string): string =>
  `/player-assets/${gameId}/decks/${filename}`

export function DeckImport({
  registration,
  format,
  playerNum = 1,
  onImport,
  onBack,
  onLoadSnapshot,
}: DeckImportProps): React.ReactElement {
  const [manifest, setManifest] = React.useState<Manifest | null>(null)
  const [manifestState, setManifestState] = React.useState<'loading' | 'ok' | 'missing'>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [pasteValue, setPasteValue] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setManifestState('loading')
    fetch(MANIFEST_URL(registration.id))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        if (cancelled) return
        if (typeof data === 'object' && data !== null && (data as Manifest).manifestVersion === 1) {
          setManifest(data as Manifest)
          setManifestState('ok')
        } else {
          setManifest(null)
          setManifestState('missing')
        }
      })
      .catch(() => {
        if (cancelled) return
        // 404 / network — no manifest published yet. Not an error per se;
        // the user can still upload or paste a deck.
        setManifest(null)
        setManifestState('missing')
      })
    return () => { cancelled = true }
  }, [registration.id])

  const handleEnvelope = React.useCallback((raw: unknown): void => {
    setError(null)
    const result = validateDeckExport(raw)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const env = result.value
    if (env.deck.gameId !== registration.id) {
      setError(`Deck is for game "${env.deck.gameId}", but this is ${registration.id}.`)
      return
    }
    // Soft format check: we warn-not-block on a mismatch. The catalog/play
    // format taxonomy doesn't always line up 1:1 with the deck-build format
    // taxonomy (e.g. tcgdb has "standard" while we model "stronghold" per
    // RRG p. 2). Loading anyway lets the user proceed.
    onImport(env)
  }, [registration.id, onImport])

  const handleManifestEntry = React.useCallback((entry: ManifestEntry): void => {
    setBusy(true)
    setError(null)
    fetch(ENVELOPE_URL(registration.id, entry.filename))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => { handleEnvelope(data) })
      .catch((e: Error) => { setError(`Failed to load ${entry.filename}: ${e.message}`) })
      .finally(() => { setBusy(false) })
  }, [registration.id, handleEnvelope])

  const handleFile = React.useCallback((file: File): void => {
    setBusy(true)
    setError(null)
    file.text()
      .then((text) => {
        let parsed: unknown
        try { parsed = JSON.parse(text) }
        catch (e) { throw new Error(`Not valid JSON: ${(e as Error).message}`) }
        handleEnvelope(parsed)
      })
      .catch((e: Error) => { setError(e.message) })
      .finally(() => { setBusy(false) })
  }, [handleEnvelope])

  const handlePasteSubmit = React.useCallback((): void => {
    setError(null)
    let parsed: unknown
    try { parsed = JSON.parse(pasteValue) }
    catch (e) { setError(`Not valid JSON: ${(e as Error).message}`); return }
    handleEnvelope(parsed)
  }, [pasteValue, handleEnvelope])

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ← Back to game select
        </button>

        <h1 style={{ marginTop: 8, marginBottom: 4 }}>
          {registration.name}
          {playerNum === 2 && (
            <span style={{ color: '#7fd1a2', fontSize: '0.7em', marginLeft: 12 }}>
              · Player 2 deck
            </span>
          )}
          {playerNum === 'ai' && (
            <span style={{ color: '#e09a4a', fontSize: '0.7em', marginLeft: 12 }}>
              · Opponent (AI) deck
            </span>
          )}
        </h1>
        <p style={{ marginTop: 0, marginBottom: 24, color: '#aaa' }}>
          Format: <strong style={{ color: '#eaeaea' }}>{format.name}</strong>
          {format.description && <> — <span style={{ opacity: 0.7 }}>{format.description}</span></>}
        </p>

        {/* B3: optional "Restore a saved game" affordance — only on
            the first deck collection (after that, we're committed to
            the deck-build path). Hidden when the parent doesn't pass
            onLoadSnapshot. */}
        {onLoadSnapshot && playerNum === 1 && (
          <LoadGameSection
            onLoadSnapshot={onLoadSnapshot}
            registrationId={registration.id}
          />
        )}

        <h2 style={sectionTitleStyle}>
          {playerNum === 2 && "Import Player 2's deck"}
          {playerNum === 'ai' && "Choose your opponent's deck"}
          {playerNum !== 2 && playerNum !== 'ai' && 'Import a deck'}
        </h2>

        {/* ─── Path 1: manifest list ─────────────────────────────────── */}
        <section style={sectionStyle}>
          <h3 style={subSectionTitleStyle}>From your library</h3>
          {manifestState === 'loading' && (
            <p style={mutedStyle}>Looking for /player-assets/{registration.id}/decks/manifest.json…</p>
          )}
          {manifestState === 'missing' && (
            <p style={mutedStyle}>
              No manifest at <code>/player-assets/{registration.id}/decks/manifest.json</code>.
              Drop tcgdb-exported decks into <code>public/player-assets/{registration.id}/decks/</code> or
              run tcgdb&apos;s <code>scripts/export-deck-to-tcggg.ts</code> helper to populate it.
            </p>
          )}
          {manifestState === 'ok' && manifest && manifest.decks.length === 0 && (
            <p style={mutedStyle}>Manifest is empty.</p>
          )}
          {manifestState === 'ok' && manifest && manifest.decks.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {manifest.decks.map((d) => (
                <li key={d.filename}>
                  <button
                    onClick={() => handleManifestEntry(d)}
                    disabled={busy}
                    style={deckButtonStyle}
                  >
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                    <span style={{ opacity: 0.7, marginLeft: 12, fontSize: '0.85rem' }}>
                      {d.formatId}{d.splashClan ? ` · splash ${d.splashClan}` : ''} · {d.cardCount} cards
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Path 2: file upload ───────────────────────────────────── */}
        <section style={sectionStyle}>
          <h3 style={subSectionTitleStyle}>From a JSON file</h3>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              // Reset so re-picking the same file still triggers onChange.
              e.target.value = ''
            }}
            style={{ color: '#eaeaea' }}
          />
        </section>

        {/* ─── Path 3: paste textarea ────────────────────────────────── */}
        <section style={sectionStyle}>
          <h3 style={subSectionTitleStyle}>Paste deck JSON</h3>
          <textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder='{ "exportVersion": 1, "deck": { … }, "cards": { … } }'
            rows={6}
            disabled={busy}
            style={textareaStyle}
          />
          <button
            onClick={handlePasteSubmit}
            disabled={busy || !pasteValue.trim()}
            style={{ ...primaryButtonStyle, marginTop: 8 }}
          >
            Load pasted deck
          </button>
        </section>

        {error && (
          <div style={errorStyle}>
            <strong>Import failed:</strong> {error}
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// LoadGameSection — B3 entry point
// ────────────────────────────────────────────────────────────────────────

function LoadGameSection({
  onLoadSnapshot, registrationId,
}: {
  onLoadSnapshot: (snapshot: SavedGame) => void
  registrationId: string
}): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null)
  const [pasteValue, setPasteValue] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  function tryLoad(text: string, sourceLabel: string): void {
    setError(null)
    let snapshot: SavedGame
    try {
      snapshot = parseSavedGame(text)
    } catch (e) {
      setError(`Couldn't parse ${sourceLabel}: ${(e as Error).message}`)
      return
    }
    if (snapshot.gameId !== registrationId) {
      setError(
        `Saved game is for "${snapshot.gameId}", but you're in the "${registrationId}" ` +
        `flow. Switch games via the top-left link to load this save.`
      )
      return
    }
    onLoadSnapshot(snapshot)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      tryLoad(text, file.name)
    }
    reader.onerror = () => setError(`Failed to read ${file.name}.`)
    reader.readAsText(file)
  }

  return (
    <section style={{
      background: '#202020',
      border: '1px solid #2a3a3a',
      borderRadius: 6,
      padding: 16,
      marginBottom: 20,
    }}>
      <h3 style={{ margin: 0, marginBottom: 4, color: '#f5d484' }}>
        🏁 Restore a saved game
      </h3>
      <p style={{ marginTop: 0, marginBottom: 12, color: '#aaa', fontSize: '0.85rem' }}>
        Pick up a game you previously saved with the in-game{' '}
        <span style={{ color: '#7fd1a2' }}>Save game</span> button.
        Decks and live state are restored from the file; you skip the deck-import
        step entirely.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onFileChange}
          style={{ flex: 1, minWidth: 200, color: '#ccc' }}
        />
        <details style={{ flex: 2, minWidth: 240, color: '#aaa' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>or paste JSON</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <textarea
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder='{"savedGameVersion":1, ...}'
              rows={4}
              style={{
                width: '100%',
                background: '#181818',
                color: '#eaeaea',
                border: '1px solid #333',
                borderRadius: 3,
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                padding: 6,
              }}
            />
            <button
              onClick={() => tryLoad(pasteValue, 'pasted text')}
              disabled={!pasteValue.trim()}
              style={{
                background: pasteValue.trim() ? '#243' : '#1a1a1a',
                color: pasteValue.trim() ? '#eaeaea' : '#666',
                border: `1px solid ${pasteValue.trim() ? '#7fd1a2' : '#333'}`,
                padding: '4px 10px',
                borderRadius: 3,
                cursor: pasteValue.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                alignSelf: 'flex-start',
              }}
            >
              Restore from paste
            </button>
          </div>
        </details>
      </div>
      {error && (
        <div style={{
          marginTop: 10,
          background: '#3a1a1a',
          border: '1px solid #e87070',
          color: '#e87070',
          padding: '8px 10px',
          borderRadius: 4,
          fontSize: '0.8rem',
        }}>
          {error}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#eaeaea',
  minHeight: '100vh',
  fontFamily: 'system-ui, sans-serif',
  padding: '40px 24px',
}

const contentStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  marginTop: 8,
  marginBottom: 16,
  borderBottom: '1px solid #333',
  paddingBottom: 8,
}

const subSectionTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  marginBottom: 8,
  color: '#bbb',
}

const sectionStyle: React.CSSProperties = {
  background: '#222',
  border: '1px solid #2a2a2a',
  padding: 16,
  borderRadius: 6,
  marginBottom: 16,
}

const mutedStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '0.85rem',
  margin: 0,
}

const backButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#aaa',
  border: '1px solid #444',
  padding: '0.4rem 0.8rem',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.8rem',
}

const deckButtonStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#eaeaea',
  border: '1px solid #444',
  padding: '0.7rem 1rem',
  borderRadius: 4,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  fontSize: '0.9rem',
}

const primaryButtonStyle: React.CSSProperties = {
  background: '#243',
  color: '#eaeaea',
  border: '1px solid #7fd1a2',
  padding: '0.5rem 1rem',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.85rem',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a1a',
  color: '#eaeaea',
  border: '1px solid #444',
  borderRadius: 4,
  padding: 8,
  fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
  fontSize: '0.8rem',
  boxSizing: 'border-box',
}

const errorStyle: React.CSSProperties = {
  background: '#3a1a1a',
  color: '#f4a5a5',
  border: '1px solid #663',
  padding: 12,
  borderRadius: 4,
  marginTop: 16,
  fontSize: '0.85rem',
}
