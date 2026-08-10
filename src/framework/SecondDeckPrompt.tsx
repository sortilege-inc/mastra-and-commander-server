/**
 * After the user imports their first deck, ask whether to load a
 * second deck for hotseat (2-player) play or proceed solo.
 *
 * Strictly a framework-level component — no game-specific code.
 */
import * as React from 'react'
import type { GameRegistration, FormatRegistration } from './types'

interface SecondDeckPromptProps {
  registration: GameRegistration
  format: FormatRegistration
  firstDeckName: string
  onAddSecond: () => void
  onStartSolo: () => void
  onBack: () => void
}

export function SecondDeckPrompt({
  registration, format, firstDeckName, onAddSecond, onStartSolo, onBack,
}: SecondDeckPromptProps): React.ReactElement {
  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ← Choose a different deck
        </button>

        <h1 style={{ marginTop: 12, marginBottom: 4 }}>{registration.name}</h1>
        <p style={{ marginTop: 0, marginBottom: 24, color: '#aaa' }}>
          Format: <strong style={{ color: '#eaeaea' }}>{format.name}</strong>
        </p>

        <h2 style={sectionTitleStyle}>Player 1 deck loaded</h2>
        <div style={confirmedStyle}>
          <strong>{firstDeckName}</strong>
          <span style={{ opacity: 0.7, marginLeft: 12, fontSize: '0.85rem' }}>
            ← Player 1
          </span>
        </div>

        <h2 style={{ ...sectionTitleStyle, marginTop: 32 }}>
          How do you want to play?
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={onAddSecond} style={primaryButtonStyle}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Hotseat (2 players) →
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
              Load a second deck for Player 2. You'll take turns at the
              same device, with a "pass the device" prompt at handoffs.
            </div>
          </button>

          <button onClick={onStartSolo} style={secondaryButtonStyle}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Solo / single-player →
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
              Player 2's seat stays empty. Useful for setup
              walkthroughs, deck testing, ability triggering.
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

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
  fontSize: '1.05rem',
  marginTop: 0,
  marginBottom: 12,
  borderBottom: '1px solid #333',
  paddingBottom: 6,
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
const confirmedStyle: React.CSSProperties = {
  background: '#223',
  border: '1px solid #355',
  padding: '12px 16px',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
}
const primaryButtonStyle: React.CSSProperties = {
  background: '#243',
  color: '#eaeaea',
  border: '1px solid #7fd1a2',
  padding: '14px 20px',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
  flex: 1,
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
}
const secondaryButtonStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#eaeaea',
  border: '1px solid #555',
  padding: '14px 20px',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
  flex: 1,
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
}
