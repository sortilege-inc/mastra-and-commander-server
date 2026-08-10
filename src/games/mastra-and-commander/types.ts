/**
 * Game state (`G`) for Mastra & Commander.
 *
 * HARD RULE (inherited from tcggg's L5R engine, learned the hard way there):
 * this state must be JSON-serializable end to end — no class instances, no
 * functions, no Map/Set, no Date, no RNG references. boardgame.io serializes G
 * for its log, the saved-game envelope, and the replay transcript; anything
 * non-serializable silently corrupts all three. Cards are referenced by id
 * (string) and looked up in the static registry.
 *
 * Shape notes:
 *  - FLAT. One `phase` field drives the round loop (see Game.ts for why we do
 *    not use boardgame.io `phases`).
 *  - Every `pending*` field is a GATE: while non-null it blocks normal play and
 *    must be cleared by its resolving move. gates.ts holds the manifest and the
 *    compile-time totality check — adding a `pending*` field here will fail to
 *    compile until it is registered there.
 */
import type { Contribution, PipCounts, RoundPhase } from './constants'

/** One card in a Context chain, with its unspent outputs and round-state marks. */
export interface ContextSlot {
  cardId: string
  /** This card's produce, minus whatever the next card has already spent.
   *  Design §4: a card's outputs fund the NEXT card's inputs. */
  outputsRemaining: PipCounts
  /** Marked during evalCheck to carry this card into the next round.
   *  Non-durable relays feed Entropy at rollover (design §4). */
  relayed: boolean
  /** A Subvert wrench blanked this card's contributions for this round. */
  subverted: boolean
}

/** One Process's line of execution — the left→right context window (design §4).
 *  Parallelism opens additional concurrent chains. */
export interface ContextChain {
  slots: ContextSlot[]
  /** A closed Process still scores (design §4: "closes out with or without
   *  your results") but takes no further cards. */
  closed: boolean
}

/** An installed server (design §4): a face-down substrate card with a
 *  capability trait card played onto it. The substrate is the attack surface. */
export interface ServerInstall {
  /** Face-down — hidden from the Entropy seat by playerView. */
  substrateCardId: string
  /** The MCP / Skill / Tool card providing the capability. */
  traitCardId: string
  disabled: boolean
}

/** Where an eval landed on the success ladder (design §4). */
export type EvalTier = 'superior' | 'best' | 'lesser' | 'failure'

/** One completed round's outcome, for the match record and the UI. */
export interface RoundResult {
  round: number
  evalId: string
  tier: EvalTier
  /** Cards in the Context when scored — compared against the eval's par. */
  contextSize: number
}

export interface MCState {
  // ── Meta ────────────────────────────────────────────────────────────────
  round: number
  phase: RoundPhase
  roundResults: RoundResult[]
  /** Set once the match ends (BEST-GUESS(Q13): after MATCH_ROUNDS rounds). */
  matchWinner: 'operator' | 'entropy' | null
  /** Human-readable play log, newest last. */
  log: string[]

  // ── Operator zones ──────────────────────────────────────────────────────
  /** Index 0 is the top of the deck. */
  operatorDeck: string[]
  operatorHand: string[]
  operatorDiscard: string[]
  /** One chain per open Process. Always at least one. */
  contexts: ContextChain[]
  /** How many concurrent Processes are allowed this round. */
  processLimit: number
  /** Command zone — always in play (design §4). */
  commanderId: string
  /** Starting equipment; auto-pitches from the deck top each round. */
  loadout: string[]
  installedModelId: string
  /** Free resources granted this round by equipment / model / servers. Spent,
   *  never tapped; zeroed at rollover. */
  roundPool: PipCounts
  servers: ServerInstall[]

  // ── RAG track (design §4: 4 steps; completing clears random Entropy) ─────
  ragSteps: string[]
  /** Locked to the final card's contribution once the track completes; then
   *  contributes toward every eval until reset. */
  ragLockedContribution: Contribution | null

  // ── Claw (design §4: face-down loader → second parallel hand) ────────────
  /** Face-down; hidden from the opponent. */
  clawPile: string[]
  /** Playable as a second hand once the pile completes. */
  clawHand: string[]

  // ── Features (design §4: no Entropy cost; 1–3 picks by eval difficulty) ──
  featuresDeck: string[]
  /** Revealed to choose among this round. */
  featureOffer: string[]
  activeFeatureIds: string[]
  /** Set by the TRACING feature — skips the next Entropy feed. */
  ignoreNextFeed: boolean

  // ── Entropy zones ───────────────────────────────────────────────────────
  entropyDeck: string[]
  /** LIFO — the end of the array is the top of the stack. Resolved in reverse
   *  order (design §2). PERSISTS across rounds on a failed eval. */
  entropyStack: string[]
  /** Resolved this round; fate decided at rollover (persist on failure). */
  entropyResolved: string[]
  entropyDiscard: string[]
  /** Junk contributions injected by Pollute wrenches; scored against the eval,
   *  cleared at rollover. */
  injectedContributions: Contribution[]
  /** Telemetry for the UI — how much Entropy the Operator generated this round. */
  entropyFedThisRound: number

  // ── Eval ────────────────────────────────────────────────────────────────
  evalDeck: string[]
  currentEvalId: string | null

  // ── Pending gates (see gates.ts) ────────────────────────────────────────
  /** Operator must pick Features at Reveal (count set by eval difficulty). */
  pendingFeaturePicks: { remaining: number } | null
  /** A targeted Entropy effect awaits a target choice (Entropy seat in hotseat;
   *  auto-resolved deterministically in solo). */
  pendingEntropyTarget: { entropyCardId: string; effectKind: string } | null
  /** A failed eval offers the Operator the chance to scrap their own engine to
   *  shed persisting Entropy (design §4: Durable −3, Setup −5). */
  pendingFailureScrap: { removableCount: number } | null
}
