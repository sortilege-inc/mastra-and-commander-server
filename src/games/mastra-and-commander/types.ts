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

/**
 * What an installed resource a face-down CALL slot is invoking.
 *
 * Installed Tools, attached Skills, and a completed RAG track do NOT score on
 * their own (owner ruling, 2026-08-10). To use one in an eval you play a card
 * face-down into the Context — free, since the Entropy was paid at install —
 * and the called resource's Contribution is what lands in the Context.
 */
export type CallTarget =
  | { kind: 'server'; serverId: string }
  | { kind: 'skill'; equipmentId: string }
  | { kind: 'rag' }

/** One card in a Context chain, with its unspent outputs and round-state marks. */
export interface ContextSlot {
  /** The card physically occupying the slot. For a CALL this is the face-down
   *  card spent to make the call — its own printed face is irrelevant. */
  cardId: string
  /** True for a face-down CALL slot (see CallTarget). */
  faceDown: boolean
  /** Set on a CALL slot: the installed resource being invoked, whose
   *  Contribution this slot supplies. Null for a normally-played card. */
  calls: CallTarget | null
  /** This card's produce, minus whatever the next card has already spent.
   *  Design §4: a card's outputs fund the NEXT card's inputs. */
  outputsRemaining: PipCounts
  /** Marked during evalCheck to carry this card into the next round.
   *  Non-durable relays feed Entropy at rollover (design §4). */
  relayed: boolean
  /** A Subvert wrench blanked this card's contributions for this round. */
  subverted: boolean
}

/** A Skill attached to a loadout item (rig / cloud). Gains Durable and
 *  persists; reached by playing a face-down CALL. */
export interface SkillAttachment {
  equipmentId: string
  skillCardId: string
}

/**
 * The RAG track — a setup saga (owner ruling, 2026-08-10).
 *
 * In play from the start. Chapters advance one at a time, each costing a pip of
 * its own type (RAG_CHAPTERS). The card fed to Upsert sets `contribution`,
 * which is what a CALL to RAG supplies; the optional Rerank chapter swaps that
 * payload for another of the same size.
 */
export interface RagTrack {
  /** How many chapters are complete — an index into RAG_CHAPTERS. */
  chaptersComplete: number
  /** The card fed to Upsert; its Contribution is RAG's payload. */
  upsertCardId: string | null
  /** What a CALL to RAG contributes. Set at Upsert, swappable by Rerank. */
  contribution: Contribution[]
  /** True once Rerank has been used (it is a one-shot swap). */
  rerankUsed: boolean
}

/** One context window — the left→right chain (design §4). Parallelism opens
 *  additional concurrent Processes; a Subagent opens a nested sub-context. */
export interface ContextChain {
  slots: ContextSlot[]
  /** A closed Process still scores (design §4: "closes out with or without
   *  your results") but takes no further cards. */
  closed: boolean
  /**
   * How many cards this window can hold (owner ruling, 2026-08-10). Set from
   * the Objective's `contextCeiling`, defaulting to DEFAULT_CONTEXT_CEILING.
   */
  ceiling: number
  /**
   * Index of the chain whose Subagent spawned this one, or null for a
   * top-level Process. A sub-context's cards do NOT count against its parent's
   * ceiling — delegating is how you exceed one window's capacity.
   */
  parentChainIx: number | null
  /** The Subagent card that owns this sub-context (null at top level). */
  ownerCardId: string | null
}

/** An installed server (design §4): a face-down substrate card with a
 *  capability trait card played onto it. The substrate is the attack surface. */
export interface ServerInstall {
  /**
   * Stable identity, assigned at install and never reused.
   *
   * NOT the array index: Entropy's attackServer removes a server outright, and
   * anything holding an index (a face-down CALL already in the Context) would
   * then dangle or, worse, silently slide onto the next server along. Ids are
   * minted from `nextServerSeq` so they stay deterministic for replay.
   */
  id: string
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
  /** Set once the match ends — after MATCH_ROUNDS evals, or when the Operator
   *  cycles through their deck (owner ruling, 2026-08-10). */
  matchWinner: 'operator' | 'entropy' | null
  /** Why the match ended, for the UI. */
  matchEndReason: 'rounds' | 'deckOut' | null
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
  frameworkId: string
  /** Starting equipment; auto-pitches from the deck top each round. */
  loadout: string[]
  installedModelId: string
  /** Free resources granted this round by equipment / model / servers. Spent,
   *  never tapped; zeroed at rollover. */
  roundPool: PipCounts
  /** Installed MCP servers — a Tool over a face-down substrate. Persist for
   *  the whole match; reached by a face-down CALL. */
  servers: ServerInstall[]
  /** Monotonic counter behind ServerInstall.id. Never decremented, so an id is
   *  never reused even after its server is destroyed. */
  nextServerSeq: number
  /** Skills attached to loadout items. Persist; reached by a CALL. */
  skillAttachments: SkillAttachment[]
  /** Set once the framework's free Agent has been used this round. */
  frameworkFreeAgentUsed: boolean

  // ── RAG — the setup saga ────────────────────────────────────────────────
  rag: RagTrack

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
