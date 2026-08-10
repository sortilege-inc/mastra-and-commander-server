/**
 * Shared style vocabulary for the board.
 *
 * One place for colors/spacing so the board components stay visually
 * consistent (tcggg's L5R engine keeps the same convention in its theme.ts).
 * The contribution colors deliberately match the design's color names.
 */
import type * as React from 'react'
import type { Color, Shape } from './constants'

export const C = {
  bg: '#0d0d0d',
  panel: '#161616',
  panelAlt: '#1c1c1c',
  border: '#333',
  borderBright: '#4a4a4a',
  text: '#eaeaea',
  dim: '#9a9a9a',
  accent: '#7fd1a2',
  accentBg: '#173026',
  danger: '#e2707a',
  dangerBg: '#2e1719',
  warn: '#e0b062',
} as const

/** Swatches for the five contribution colors. */
export const COLOR_SWATCH: Record<Color, string> = {
  pink: '#e46ba0',
  cyan: '#4fc3d9',
  amber: '#e0a952',
  violet: '#9b7fd4',
  green: '#6fc48b',
}

/** Glyphs for the five ordered shapes (ordered by side count). */
export const SHAPE_GLYPH: Record<Shape, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  pentagon: '⬟',
  hexagon: '⬢',
}

/** Icons for the resource pips. */
export const PIP_GLYPH: Record<string, string> = {
  capital: '◆',
  attention: '◉',
  technology: '⚙',
  generic: '○',
}

export const panel: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 12,
}

export const btn = (active = true): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${active ? C.accent : C.border}`,
  background: active ? C.accentBg : C.panelAlt,
  color: active ? C.accent : C.dim,
  cursor: active ? 'pointer' : 'not-allowed',
  fontSize: '0.85rem',
  fontFamily: 'system-ui, sans-serif',
})
