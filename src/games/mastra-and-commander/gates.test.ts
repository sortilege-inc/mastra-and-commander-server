/**
 * Gate-manifest cross-check.
 *
 * The manifest claims, for each gate, which moves resolve it and which overlay
 * renders it. TypeScript enforces that every `pending*` field HAS an entry;
 * only a test can enforce that the entry's claims are TRUE. Without this, a
 * renamed move silently orphans a gate and deadlocks the game.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GATE_MANIFEST, openGate } from './gates'
import type { PendingGateKey } from './gates'
import { MastraCommander } from './Game'
import { emptyGameState } from './testing/fixtures'

const GATE_KEYS = Object.keys(GATE_MANIFEST) as PendingGateKey[]

describe('GATE_MANIFEST', () => {
  it('registers every pending* field on the state', () => {
    // Compile-time totality already guarantees this, but an explicit runtime
    // check documents the intent and catches a state built by other means.
    const G = emptyGameState()
    const pendingFields = Object.keys(G).filter((k) => k.startsWith('pending'))
    expect(new Set(pendingFields)).toEqual(new Set(GATE_KEYS))
  })

  it('names only moves that actually exist in the game definition', () => {
    const moveNames = Object.keys(MastraCommander.moves ?? {})
    for (const key of GATE_KEYS) {
      for (const moveName of GATE_MANIFEST[key].resolveMoves) {
        expect(moveNames, `gate ${key} claims move ${moveName}`).toContain(moveName)
      }
    }
  })

  it('gives every gate at least one resolving move', () => {
    for (const key of GATE_KEYS) {
      expect(GATE_MANIFEST[key].resolveMoves.length).toBeGreaterThan(0)
    }
  })

  it('names overlay components that exist in GateOverlays.tsx', () => {
    const source = readFileSync(join(__dirname, 'GateOverlays.tsx'), 'utf-8')
    for (const key of GATE_KEYS) {
      const overlay = GATE_MANIFEST[key].overlay
      expect(source, `gate ${key} claims overlay ${overlay}`)
        .toContain(`export function ${overlay}`)
    }
  })

  it('documents each gate', () => {
    for (const key of GATE_KEYS) {
      expect(GATE_MANIFEST[key].note.length).toBeGreaterThan(20)
    }
  })
})

describe('openGate', () => {
  it('reports no gate on a clean state', () => {
    expect(openGate(emptyGameState())).toBeNull()
  })

  it('reports the gate that is blocking', () => {
    const G = emptyGameState()
    G.pendingFeaturePicks = { remaining: 1 }
    expect(openGate(G)).toBe('pendingFeaturePicks')
  })
})

describe('rules module layout', () => {
  it('keeps every move implementation out of Game.ts', () => {
    // Game.ts is a manifest: it should import move handlers, never define them.
    const source = readFileSync(join(__dirname, 'Game.ts'), 'utf-8')
    expect(source).not.toMatch(/moves:\s*{[^}]*\([^)]*\)\s*=>/s)
  })

  it('has a rules module for every phase', () => {
    const files = readdirSync(join(__dirname, 'rules'))
    for (const expected of [
      'phaseMoves.ts', 'revealMoves.ts', 'playMoves.ts',
      'entropyMoves.ts', 'responseMoves.ts', 'evalMoves.ts',
    ]) {
      expect(files).toContain(expected)
    }
  })
})
