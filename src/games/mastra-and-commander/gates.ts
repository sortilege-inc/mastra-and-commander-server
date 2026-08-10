/**
 * Pending-gate manifest.
 *
 * Every `pending*` field on MCState is a GATE: while it is non-null it blocks
 * normal play and must be cleared by a specific move. Each gate needs up to
 * three coordinated artifacts — the state field, the move(s) that resolve it,
 * and the overlay that renders the choice — and nothing but this file forces
 * those to stay in sync.
 *
 * The pattern (and this file's shape) is lifted from tcggg's L5R engine, where
 * an unregistered gate silently deadlocked games. Two layers of enforcement:
 *
 *  1. COMPILE TIME — `PendingGateKey` is derived from MCState, so adding a
 *     `pendingFoo` field makes GATE_MANIFEST fail to typecheck until an entry
 *     exists.
 *  2. TEST — gates.test.ts cross-checks every `resolveMoves` name against the
 *     real moves map in Game.ts, so a renamed move can't orphan a gate.
 */
import type { MCState } from './types'

/** Every `pending*` key on the state. Derived, never hand-listed. */
export type PendingGateKey = Extract<keyof MCState, `pending${string}`>

export interface GateSpec {
  /** Which seat is being asked. */
  seat: 'operator' | 'entropy'
  /** Moves that can clear this gate. Checked against Game.ts's moves map. */
  resolveMoves: string[]
  /** Component in GateOverlays.tsx that renders the choice. */
  overlay: string
  /** One-line description of what the gate is waiting for. */
  note: string
}

export const GATE_MANIFEST: Record<PendingGateKey, GateSpec> = {
  pendingFeaturePicks: {
    seat: 'operator',
    resolveMoves: ['pickFeature', 'skipFeaturePicks'],
    overlay: 'FeaturePickOverlay',
    note: "Reveal: select the Features the eval's difficulty allows (design §4).",
  },
  pendingEntropyTarget: {
    seat: 'entropy',
    resolveMoves: ['chooseEntropyTarget', 'autoResolveEntropyTarget'],
    overlay: 'EntropyTargetOverlay',
    note: 'Entropy: a targeted wrench (subvert / attack server) awaits a target. '
      + 'Solo auto-resolves to the leftmost eligible target.',
  },
  pendingFailureScrap: {
    seat: 'operator',
    resolveMoves: ['scrapForEntropy', 'acceptOutcome'],
    overlay: 'FailureScrapOverlay',
    note: 'Eval check: a failed eval offers scrapping your own engine to shed '
      + 'persisting Entropy (Durable −3, Setup −5).',
  },
}

/** The gate currently blocking play, if any. */
export function openGate(G: MCState): PendingGateKey | null {
  for (const key of Object.keys(GATE_MANIFEST) as PendingGateKey[]) {
    if (G[key] !== null) return key
  }
  return null
}
