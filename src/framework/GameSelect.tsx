/**
 * Three-step picker: pick a game, then a format / mode within it, then
 * how you want to play (Hotseat vs Vs AI).
 *
 * Locked-in UX per CLAUDE.md: required on first load; localStorage
 * remembers the choice for return visits; the app reads from storage
 * before mounting this component.
 *
 * Per docs/ai-opponent-plan.md (Stage AI-A): the Mode picker was added
 * here so the mode is established before the deck-import flow. Hotseat
 * is the default and identical to the historical behaviour. Vs AI
 * routes through the same flow but the second deck import is reframed
 * as "Choose your opponent's deck" (DeckImport.tsx, playerNum='ai').
 *
 * The format click no longer auto-advances — both format and mode must
 * be picked before the user clicks Start. Auto-advance after the third
 * pick would feel surprising given the new step count.
 */
import * as React from 'react'
import type { GameRegistration } from './types'
import { listGames } from './registry'
import type { GameMode, RecordTranscriptsChoice } from './storage'
import {
  loadRecordTranscriptsChoice, saveRecordTranscriptsChoice,
} from './storage'

interface Props {
  onChoose: (gameId: string, formatId: string, mode: GameMode) => void
}

const PANE: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#eaeaea',
  fontFamily: 'system-ui, sans-serif',
  minHeight: '100vh',
  padding: '3rem 2rem',
}

const CARD: React.CSSProperties = {
  background: '#222',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '1.25rem 1.5rem',
  cursor: 'pointer',
  transition: 'border-color 80ms ease',
}

const CARD_ACTIVE: React.CSSProperties = {
  ...CARD,
  borderColor: '#7fd1a2',
  background: '#243',
}

export function GameSelect({ onChoose }: Props): React.ReactElement {
  const games = listGames()
  const [pickedGameId, setPickedGameId] = React.useState<string | null>(null)
  const [pickedFormatId, setPickedFormatId] = React.useState<string | null>(null)
  const [pickedMode, setPickedMode] = React.useState<GameMode | null>(null)
  const pickedGame: GameRegistration | undefined = pickedGameId
    ? games.find((g) => g.id === pickedGameId)
    : undefined

  // Resetting downstream picks when the upstream choice changes keeps
  // the user from accidentally launching with a stale combination.
  function pickGame(id: string): void {
    setPickedGameId(id)
    setPickedFormatId(null)
    setPickedMode(null)
  }
  function pickFormat(id: string): void {
    setPickedFormatId(id)
    setPickedMode(null)
  }

  const canStart = pickedGameId !== null
    && pickedFormatId !== null
    && pickedMode !== null

  return (
    <div style={PANE}>
      <h1 style={{ marginTop: 0 }}>Mastra &amp; Commander</h1>
      <p style={{ opacity: 0.7, maxWidth: 640 }}>
        Pick a game, a format, and how you want to play. We&apos;ll remember
        your choice so you can skip this on return; the <em>Switch game</em>{' '}
        link in the top corner of the play area takes you back here.
      </p>

      {/* ─── Step 1: Game ──────────────────────────────────────────── */}
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', opacity: 0.8 }}>1. Game</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
          {games.map((g) => (
            <div
              key={g.id}
              role="button"
              tabIndex={0}
              onClick={() => pickGame(g.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickGame(g.id) }}
              style={pickedGameId === g.id ? CARD_ACTIVE : CARD}
            >
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{g.name}</div>
              {g.tagline && (
                <div style={{ opacity: 0.65, fontSize: '0.85rem', marginTop: '0.35rem' }}>{g.tagline}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Step 2: Format ────────────────────────────────────────── */}
      {pickedGame && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', opacity: 0.8 }}>2. Format</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
            {pickedGame.formats.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => { if (!f.comingSoon) pickFormat(f.id) }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !f.comingSoon) pickFormat(f.id) }}
                style={{
                  ...(pickedFormatId === f.id ? CARD_ACTIVE : CARD),
                  opacity: f.comingSoon ? 0.4 : 1,
                  cursor: f.comingSoon ? 'not-allowed' : 'pointer',
                }}
              >
                <div style={{ fontSize: '1.0rem', fontWeight: 600 }}>
                  {f.name}
                  {f.comingSoon && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>(coming soon)</span>}
                </div>
                {f.description && (
                  <div style={{ opacity: 0.65, fontSize: '0.85rem', marginTop: '0.35rem' }}>{f.description}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Step 3: Mode ──────────────────────────────────────────── */}
      {pickedGame && pickedFormatId && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', opacity: 0.8 }}>3. Play mode</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
            <ModeCard
              picked={pickedMode === 'hotseat'}
              label="Hotseat"
              tagline="Two humans share the keyboard. The app prompts you to pass the device at handoffs."
              onPick={() => setPickedMode('hotseat')}
            />
            <ModeCard
              picked={pickedMode === 'vs-ai'}
              label="Vs AI"
              tagline="Single-player vs a built-in AI opponent. Not wired up yet for Mastra & Commander."
              onPick={() => setPickedMode('vs-ai')}
            />
          </div>
        </section>
      )}

      {/* ─── Recording toggle (always visible once mode picked) ──── */}
      {pickedGame && pickedFormatId && pickedMode && (
        <section style={{ marginTop: '2rem' }}>
          <RecordTranscriptsToggle pickedMode={pickedMode} />
        </section>
      )}

      {/* ─── Start button ──────────────────────────────────────────── */}
      {canStart && pickedGameId && pickedFormatId && pickedMode && (
        <section style={{ marginTop: '1.5rem' }}>
          <button
            onClick={() => onChoose(pickedGameId, pickedFormatId, pickedMode)}
            style={startButtonStyle}
          >
            Start →
          </button>
        </section>
      )}
    </div>
  )
}

function ModeCard({
  picked, label, tagline, onPick,
}: {
  picked: boolean
  label: string
  tagline: string
  onPick: () => void
}): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick() }}
      style={picked ? CARD_ACTIVE : CARD}
    >
      <div style={{ fontSize: '1.0rem', fontWeight: 600 }}>{label}</div>
      <div style={{ opacity: 0.65, fontSize: '0.85rem', marginTop: '0.35rem' }}>
        {tagline}
      </div>
    </div>
  )
}

function RecordTranscriptsToggle({ pickedMode }: { pickedMode: GameMode }): React.ReactElement {
  const [value, setValue] = React.useState<RecordTranscriptsChoice>(loadRecordTranscriptsChoice())
  const onPick = (v: RecordTranscriptsChoice): void => {
    setValue(v)
    saveRecordTranscriptsChoice(v)
  }
  // Surface the effective behaviour for the picked mode.
  const willRecord =
    value === 'always' || (value === 'vs-ai-only' && pickedMode === 'vs-ai')
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 4 }}>
        Record this game?
      </div>
      <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 10 }}>
        Save a JSONL transcript when the game ends — every move plus
        outcome metadata, downloaded to your browser. Used for analysis
        and (later) training future AI iterations. Default skips hotseat
        games for privacy.
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {(['always', 'vs-ai-only', 'never'] as RecordTranscriptsChoice[]).map((opt) => (
          <label key={opt} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', fontSize: '0.85rem',
            color: value === opt ? '#7fd1a2' : '#bbb',
          }}>
            <input
              type="radio"
              checked={value === opt}
              onChange={() => onPick(opt)}
            />
            {opt === 'always' && 'Always'}
            {opt === 'vs-ai-only' && 'Vs AI only (default)'}
            {opt === 'never' && 'Never'}
          </label>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: willRecord ? '#7fd1a2' : '#888' }}>
        {willRecord ? '● This game will be recorded.' : '○ This game will NOT be recorded.'}
      </div>
    </div>
  )
}

const startButtonStyle: React.CSSProperties = {
  background: '#7fd1a2',
  color: '#0a0a0a',
  border: 'none',
  borderRadius: 6,
  padding: '0.75rem 1.5rem',
  fontSize: '1.0rem',
  fontWeight: 600,
  cursor: 'pointer',
}
