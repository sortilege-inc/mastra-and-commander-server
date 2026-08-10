/**
 * Mastra & Commander — rules constants. Single source of truth.
 *
 * Style (borrowed from tcggg's L5R engine): const objects / const-asserted
 * arrays with literal unions derived via `typeof X[number]`. Deliberately NO
 * TypeScript `enum` — game state must stay JSON-serializable end to end.
 *
 * Every value here that the design doc leaves 🟨 (proposed) or ❓ (open) is
 * tagged `BEST-GUESS(Qn)`, where Qn is the numbered open question in
 * ../../../../mastra-and-commander/cards/game-design.md §9. The owner signed off
 * on implementing first-pass placeholder rules for all of them (2026-08-10); the
 * full audit list lives in README.md's "Best-guess registry". Changing the game's
 * balance should mean changing THIS file, not the rules modules.
 */

// ── Contribution vocabulary (design ❓Q1 — owner-decided 5 × 5, 2026-08-10) ──
// Contribution = (Color, Shape). The Eval scores patterns over these.

/** Contribution colors — the "suits" of the eval hand. */
export const COLORS = ['pink', 'cyan', 'amber', 'violet', 'green'] as const
export type Color = typeof COLORS[number]

/** Contribution shapes — ORDERED (by side count); `runOfShapes` evals read
 *  this order, so reordering this array changes which runs are legal. */
export const SHAPES = ['circle', 'triangle', 'square', 'pentagon', 'hexagon'] as const
export type Shape = typeof SHAPES[number]

export interface Contribution {
  color: Color
  shape: Shape
}

// ── Resources (design §4 — locked: three types, spent, never tapped) ──

/** The three real currencies. `generic` is the 4th pip type but is not a
 *  currency you can hold — see Pip. */
export const CURRENCIES = ['capital', 'attention', 'technology'] as const
export type Currency = typeof CURRENCIES[number]

/** A cost/output pip as printed on a card edge. `generic` (the design's `blank`
 *  pip) means "any type" on a cost, and "unassigned" on an output. */
export const PIPS = ['capital', 'attention', 'technology', 'generic'] as const
export type Pip = typeof PIPS[number]

/** Counted resource pool. Kept as a plain record (not a Map) for serializability. */
export interface PipCounts {
  capital: number
  attention: number
  technology: number
  generic: number
}

export const EMPTY_PIPS: PipCounts = {
  capital: 0, attention: 0, technology: 0, generic: 0,
}

// ── Round loop (design §2 — locked) ──

export const ROUND_PHASES = ['reveal', 'play', 'entropy', 'response', 'evalCheck'] as const
export type RoundPhase = typeof ROUND_PHASES[number]

/** Prose shown in the UI for each phase, quoting the design doc's §2 wording. */
export const PHASE_BLURB: Record<RoundPhase, string> = {
  reveal: 'Reveal an Objective from the Eval deck (the target hand).',
  play: 'Operator builds the Context: pitch cards to pay costs, draw one per pitch. Plays and pitches feed the Entropy economy.',
  entropy: 'Resolve the accumulated Entropy in reverse order (LIFO). Draw one card per Entropy resolved.',
  response: 'Operator plays responses to mitigate what the Entropy did.',
  evalCheck: "Compare the Context's contributions to the Objective and resolve on the success ladder.",
}

// ── Seats (design §3 — locked: fixed asymmetric roles) ──

/** boardgame.io playerID '0' is the Operator; '1' is Entropy. */
export const OPERATOR_SEAT = '0'
export const ENTROPY_SEAT = '1'

// ── Card taxonomy ──
// The design docs explicitly have NO card-type taxonomy yet (content-spec.md:
// "no in-game type system defined yet"). We use a minimal supertype plus
// freeform trait strings (FFG-style type line) so the engine never hard-codes a
// taxonomy the owner hasn't chosen.

export const SUPERTYPES = ['ephemeral', 'persistent'] as const
export type Supertype = typeof SUPERTYPES[number]

/** Keywords with engine meaning. Both are locked by design §7. */
export const KEYWORDS = ['durable', 'setup'] as const
export type Keyword = typeof KEYWORDS[number]

/** Traits the engine actually branches on. Cards may carry any other trait
 *  string freely — these are just the ones with wired behavior. */
export const TRAIT_EVENT = 'Event'
export const TRAIT_RESPONSE = 'Response'
export const TRAIT_MODEL = 'Model'
/** Traits that can be installed onto a face-down server substrate (design §4). */
export const INSTALLABLE_TRAITS = ['MCP', 'Skill', 'Tool'] as const

/** BEST-GUESS(Q6): the ecosystem roster. Card-level lock-in only; the commander
 *  is ecosystem-neutral (locked). Mixing forgoes discounts, no penalty. */
export const ECOSYSTEMS = ['anthropic', 'openai', 'google', 'oss'] as const
export type Ecosystem = typeof ECOSYSTEMS[number]

// ── Economy tunables ──

/** Cards fed to Entropy per Operator play/pitch. Locked at ≥1; some cards feed
 *  more than 1:1 (per-card `entropyFeed`). */
export const DEFAULT_ENTROPY_FEED = 1

// ── Placement costs (owner ruling, 2026-08-10) ──
// A Tool or Skill can be INSTALLED (expensive, persists, gains Durable) or
// played INLINE into the Context (cheap, discards at round end). Once
// installed, you reach it by playing a card face-down as a CALL — free.

/** Installing a Tool as an MCP server: the Tool plus a face-down substrate,
 *  one Entropy per card. */
export const TOOL_SERVER_ENTROPY = 2
/** Playing a Tool or Skill inline into the Context instead. No Durable. */
export const INLINE_PLACEMENT_ENTROPY = 1
/** Attaching a Skill to a loadout item (rig / cloud). Gains Durable. */
export const SKILL_ATTACH_ENTROPY = 1
/** Playing a card face-down to CALL an installed Tool / Skill / RAG. Free —
 *  the Entropy was paid when you installed it. */
export const CALL_ENTROPY = 0

/**
 * Entropy fed per pitched card, by how well its Contribution matches the
 * Contribution of the card being paid for (owner ruling, 2026-08-10).
 *
 * Pitching is ALWAYS legal — the pitched card's cost no longer has to share a
 * type. What varies is the price: feed the work something like itself and it
 * costs you little; burn something unrelated and it costs you three.
 */
export const PITCH_ENTROPY = {
  /** Same color AND same shape. */
  exact: 1,
  /** Same color OR same shape. */
  partial: 2,
  /** Neither. */
  none: 3,
} as const

/**
 * The Operator's hand is always refilled to this size (owner ruling,
 * 2026-08-10) — after plays, pitches, and Entropy resolution alike. The hand is
 * a constant; the DECK is what depletes, and running it out ends the game.
 */
export const HAND_SIZE = 5

/** Locked (design §4 success ladder): scrapping your own engine on a failed
 *  eval sheds Entropy. */
export const SCRAP_REMOVES = { durable: 3, setup: 5 } as const

/** BEST-GUESS: a "lesser" pass "adds to next round's Entropy" (locked) — this
 *  is how much. */
export const LESSER_ENTROPY_PENALTY = 1

// ── RAG — the setup saga (owner ruling, 2026-08-10) ──
//
// RAG is in play from setup and advances like an MtG Saga: each chapter costs
// one pip, and each chapter wants a DIFFERENT type, so the track can't be
// rushed on a single color. Upsert takes a card whose Contribution becomes
// RAG's payload; Rerank can swap that payload for another of equal size.

export const RAG_CHAPTERS = [
  { key: 'chunk', name: 'Chunk', cost: 'technology' },
  { key: 'embed', name: 'Embed', cost: 'attention' },
  { key: 'insert', name: 'Insert', cost: 'capital' },
  { key: 'upsert', name: 'Upsert', cost: 'generic' },
  { key: 'rerank', name: 'Rerank', cost: 'technology' },
] as const satisfies ReadonlyArray<{ key: string; name: string; cost: Pip }>

export type RagChapterKey = typeof RAG_CHAPTERS[number]['key']

/** Index of the chapter whose fed card sets RAG's contribution. */
export const RAG_UPSERT_INDEX = 3
/** Index of the optional final chapter. Everything before it is required. */
export const RAG_RERANK_INDEX = 4
/** Chapters that must be completed for RAG to produce anything. */
export const RAG_REQUIRED_CHAPTERS = RAG_RERANK_INDEX

/** BEST-GUESS(Q5): Entropy cleared when the required chapters complete. */
export const RAG_CLEAR_COUNT = 3

// ── Claw (design §4 — BEST-GUESS(Q7): completion condition is ❓) ──

export const CLAW_COMPLETE_COUNT = 3

// ── Features (design §4 — 1–3 picks by difficulty is locked) ──

/** BEST-GUESS: how many feature cards are revealed to choose among. */
export const FEATURE_OFFER_SIZE = 3
/** Locked: "the eval's difficulty sets how many you may select — generally 1–3". */
export const FEATURE_PICKS_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 }

// ── Ecosystem discount (BEST-GUESS(Q6)) ──

/** Generic pips discounted when a same-ecosystem card is already in play. */
export const ECOSYSTEM_DISCOUNT_PIPS = 1

// ── Loadout / models (design §4 — sizes 🟨, roles ❓Q11/Q12) ──

/** BEST-GUESS(Q12): two equipment slots — a local desktop rig and a cloud. */
export const LOADOUT_IDS = ['TEST-EQ-LOCAL-RIG', 'TEST-EQ-CLOUD'] as const
/** Locked: "a starting model comes in for free". */
export const STARTING_MODEL_ID = 'TEST-MODEL-SMALL'
/** BEST-GUESS(Q10): each complete server grants this much at Reveal. */
export const SERVER_GRANT: Pip[] = ['generic']

// ── Commander — Mastra (design §4; ability set by owner 2026-08-10) ──
//
// Passive, not activated: the first Agent played each round costs nothing and
// feeds no Entropy. The framework gives you one agent free; everything after it
// is on you.

export const COMMANDER_ID = 'MASTRA'
/** Trait the commander's free play applies to. */
export const COMMANDER_FREE_TRAIT = 'Agent'

// ── Match structure (owner ruling, 2026-08-10: a game is 3 evals) ──

export const MATCH_ROUNDS = 3
/** Eval passes the Operator needs to win the match. `lesser` counts as a pass. */
export const MATCH_WIN_PASSES = 2

// ── Processes (design §4 — one by default is locked; what closes one is ❓Q15) ──

export const DEFAULT_PROCESS_LIMIT = 1

// ── Context ceiling (owner ruling, 2026-08-10) ──

/**
 * How many cards a single context window may hold. An Objective may override
 * it (`EvalCardDef.contextCeiling`).
 *
 * A **Subagent** opens its own context with the same ceiling, and the cards in
 * it do NOT count against the parent's ceiling — which is exactly why you
 * delegate: it is the only way to do more work than one window can hold.
 */
export const DEFAULT_CONTEXT_CEILING = 7

/** Trait that spawns a nested sub-context when played. */
export const TRAIT_SUBAGENT = 'Subagent'
