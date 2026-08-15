/**
 * Card data contract.
 *
 * Card definitions are PURE DATA — plain serializable objects, no closures, no
 * imports from `rules/`. The rules modules interpret the small declarative
 * effect DSLs below. (tcggg's L5R engine uses the same shape at much larger
 * scale; at ~40 cards we skip its lazy codegen registry for a static map.)
 *
 * Field names mirror the printed card face exactly, per the frame spec at
 * ../../../../mastra-and-commander/cards/frame-design-brief.md (`spec.json`
 * slot keys):
 *   - LEFT edge   → `produce`     (≤5 slots) — output currencies for the NEXT card
 *   - RIGHT edge  → `consume`     (≤5 slots) — this card's input cost
 *   - BOTTOM edge → `contributes` (≤3 slots) — the Eval currency (color + shape)
 *
 * Note the frame has no stat-badge and no type-line zone, so there is no stat
 * field here and the type line is rendered from `traits`.
 */
import type {
  Color, Contribution, Ecosystem, Keyword, Pip, Shape, Supertype,
} from '../constants'

// ── Shared ────────────────────────────────────────────────────────────────

/**
 * Marks a payload the engine parses but does not yet ACT on.
 *
 * The 2026-08-13 card set prints mechanics the engine has not grown yet. Rather
 * than omit them (making a card look complete) or fake them (making it look
 * right while playing wrong), the payload is transcribed with this flag and the
 * board says so. Delete the flag when the mechanic lands.
 */
export interface MaybeUnimplemented {
  unimplemented?: true
}

/**
 * A token — put into play by other cards, never drawn or paid for.
 *
 * Tokens "do not act": no cost, no output, no Contribution. The Agent token is
 * the one that matters, because it OWNS a Context row (owner ruling,
 * 2026-08-13).
 */
export interface TokenDef {
  id: string
  name: string
  traits: string[]
  rulesText: string
}

// ── Operator cards ────────────────────────────────────────────────────────

/**
 * What a printed `Call:` ability does, on top of delivering the installed
 * card's Contribution into the Context (owner ruling, 2026-08-13: a call does
 * BOTH). Calls never feed Entropy — that was paid at install.
 */
export type CallEffect =
  | { kind: 'drawThenDiscard'; draw: number; discard: number }
  | { kind: 'gainPips'; pips: Pip[] }

/** Something an Event-trait card does when played (design §8 pitches). */
export type EventEffect =
  | { kind: 'gainPips'; pips: Pip[] }
  /** Draw N cards immediately. */
  | { kind: 'draw'; n: number }
  /** Parallelism: raise the Process limit so a second Context chain can open. */
  | { kind: 'openProcess' }
  /** Search the operator deck for a card with one of these traits and play it
   *  without feeding Entropy (Y-Combinator). Upgrades shuffle into the operator
   *  deck precisely so this can find them. */
  | ({ kind: 'tutor'; traits: string[] } & MaybeUnimplemented)

/** Something a Response-trait card does in the Response phase (design §2 step 4)
 *  to mitigate what the Entropy did. */
export type ResponseEffect =
  /** Remove up to N injected junk contributions (undo a Pollute). */
  | { kind: 'cleansePollution'; n: number }
  /** Un-subvert one Context slot (undo a Subvert). */
  | { kind: 'restoreSubverted' }
  /** Look at the top Entropy card; optionally discard it at the price of
   *  milling `discardCost` cards off the operator deck (Human-in-the-Loop).
   *  BEST-GUESS: "Once:" is read as once per round. */
  | ({ kind: 'peekEntropyDeck'; discardCost: number } & MaybeUnimplemented)

export interface OperatorCardDef {
  id: string
  name: string
  /** Minimal supertype — NOT a card-type taxonomy (the design has none yet). */
  supertype: Supertype
  /** Freeform FFG-style type line, e.g. ['Agent'], ['Tool'], ['Event']. The
   *  engine only branches on the few traits named in constants.ts. */
  traits: string[]
  /** Input cost, right edge. ≤5 pips. */
  consume: Pip[]
  /** Output currencies for the next card in the chain, left edge. ≤5 pips. */
  produce: Pip[]
  /** Color+shape pips scored by the Eval, bottom edge. ≤3. */
  contributes: Contribution[]
  /** Entropy cards fed when this is played or pitched. Locked: some cards feed
   *  more than 1:1. Defaults to DEFAULT_ENTROPY_FEED when omitted. */
  entropyFeed?: number
  keywords?: Keyword[]
  /** Vendor lock-in group; enables the same-ecosystem discount. */
  ecosystem?: Ecosystem
  /** Present on Event-trait cards. */
  event?: EventEffect
  /** Present on Response-trait cards. */
  response?: ResponseEffect
  /** Printed `Call:` ability — fires in ADDITION to delivering this card's
   *  Contribution when it is called from an install. */
  call?: CallEffect
  rulesText: string
}

// ── Entropy cards ─────────────────────────────────────────────────────────

/**
 * The three wrench vectors of design §5 — Pollution, Subversion, Goal-hijack —
 * plus supporting effects. Every payload here is BEST-GUESS: §5 names the
 * vectors and gives example cards but specifies no numbers or targeting rules.
 */
export type EntropyEffect =
  /** POLLUTION: inject junk contributions that get scored against the Eval. */
  | { kind: 'pollute'; junk: Contribution[] }
  /** SUBVERSION: blank a Context slot's contributions for this round. Targeted. */
  | { kind: 'subvert' }
  /** GOAL-HIJACK: swap the objective the Operator is scored against.
   *  BEST-GUESS(Q14): minimal open swap with the next Eval card — the hidden
   *  true-objective layer is deferred. */
  | ({ kind: 'hijack' } & MaybeUnimplemented)
  /** Destroy an installed server (the attack surface of design §4). Targeted. */
  | { kind: 'attackServer' }
  /** Targeted-entropy event (design §4: e.g. US-Gov vs Chinese models) — hits a
   *  whole ecosystem group at once. */
  | { kind: 'ecosystemTax'; ecosystem: Ecosystem }
  /** Discard a random card from the Operator's hand. */
  | { kind: 'discardRandomFromHand' }
  /** Feed additional Entropy — grows the stack mid-resolution (LIFO keeps
   *  popping, so these resolve later in the same phase). */
  | { kind: 'feedExtra'; n: number }
  /** No mechanical effect; a blank for pacing. */
  | { kind: 'none' }
  /**
   * PERSISTENT threat (owner ruling, 2026-08-13). Resolving this moves the card
   * to the THREAT ROW, where its `ongoing` effect keeps applying until its
   * `trigger` clears it. Without a trigger it stays for the rest of the match.
   */
  | { kind: 'ongoing'; ongoing: OngoingEffect; trigger?: ThreatTrigger }
  /** Fires once on resolution, then the card persists inert (or attached). */
  | { kind: 'initialize'; initialize: InitializeEffect }

/** What a threat on the threat row keeps doing. */
export type OngoingEffect =
  /** Every context row's ceiling drops by N (Token Limiter). */
  | { kind: 'ceilingReduction'; n: number }
  /** Cards producing this pip contribute nothing to the eval (PII Leak). */
  | { kind: 'blankProducersOf'; pip: Pip }
  /** Feed N extra Entropy whenever a card producing this pip enters a
   *  context (Model Collapse). */
  | { kind: 'extraFeedOnProducer'; pip: Pip; n: number }

/** What removes a threat from the threat row. */
export type ThreatTrigger =
  /** Cumulative production of `pip` across cards discarded while this threat is
   *  live reaches `total`. */
  ({ kind: 'discardedProduction'; pip: Pip; total: number } & MaybeUnimplemented)

/** A one-shot on resolution that leaves the card in play. */
export type InitializeEffect =
  /** Attach to the highest producer of `by` in play and blank its
   *  contributions (Jailbreak). Target is determined, not chosen: highest
   *  production, leftmost on a tie. */
  | { kind: 'attachAndBlank'; by: Pip }

export interface EntropyCardDef {
  id: string
  name: string
  traits: string[]
  effect: EntropyEffect
  rulesText: string
}

// ── Eval (objective) cards ────────────────────────────────────────────────

/**
 * The poker-hand pattern DSL (design §4: "five of one color", "no pink", "a run
 * of shapes", "a full house"). An Eval's patterns must ALL hold over the
 * resolved Context's contributions.
 */
export type EvalPattern =
  /** N contributions of one color. Omit `color` to mean "any single color". */
  | { kind: 'countOfColor'; color?: Color; n: number }
  /** No contribution of this color may be present (spoiled by Pollution). */
  | { kind: 'noColor'; color: Color }
  /** A run of consecutive shapes in SHAPES order, of this length. */
  | { kind: 'runOfShapes'; len: number }
  /** Three of one color plus two of another. */
  | { kind: 'fullHouse' }
  /** N contributions sharing one shape. */
  | { kind: 'nOfAShape'; n: number }
  /** At least N contributions total (compounds with noColor). */
  | { kind: 'countAny'; n: number }
  /** A specific shape appears at least N times. */
  | { kind: 'shapeAtLeast'; shape: Shape; n: number }

export interface EvalCardDef {
  id: string
  name: string
  /** Printed subhead, e.g. ['Consumer']. Flavour only — no rules hang on it. */
  traits?: string[]
  /** ALL patterns must hold to pass the eval. */
  patterns: EvalPattern[]
  /** Context size at or under which the pass counts as `best` (design: par). */
  par: number
  /** Hard cap on how many cards one context window may hold. Defaults to
   *  DEFAULT_CONTEXT_CEILING (7) when omitted. Subagent sub-contexts get their
   *  own ceiling of the same size. */
  contextCeiling?: number
  /** Context size at or under which the pass counts as `superior`. Only some
   *  evals offer a superior band (locked: "occasional evals"). */
  superiorAt?: number
  /** Sets how many Features the Operator may select (locked: 1–3). */
  difficulty: 1 | 2 | 3
  rulesText: string
}

// ── Supporting card kinds ─────────────────────────────────────────────────

/**
 * The "size" of a contribution set — its number of icons.
 *
 * RAG's Rerank chapter may swap its payload for another of EQUAL size, so this
 * is the comparison that rule turns on.
 */
export const contributionSize = (contributions: Contribution[]): number =>
  contributions.length

/** Features deck (design §4): no Entropy cost, each adds a play pattern. */
export interface FeatureCardDef {
  id: string
  name: string
  traits?: string[]
  effect:
    | { kind: 'drawNow'; n: number }
    | { kind: 'grantPip'; pip: Pip }
    /** Skip the next Entropy feed this round. */
    | { kind: 'ignoreFirstFeed' }
    /** Put N Agent tokens into play, each opening its own Context row
     *  (Parallelism). `entropy` overrides the usual per-card feed. */
    | { kind: 'spawnAgents'; n: number; entropy: number }
  rulesText: string
}

/** Starting loadout loadout (design §4): auto-pitches from the deck top and
 *  grants free resources of its types each round. */
export interface LoadoutDef {
  id: string
  name: string
  traits?: string[]
  grants: Pip[]
  /** A printed activated ability: pay pips, gain pips, optionally mill. */
  activated?: { cost: { pips: Pip[] }; gain: Pip[]; mill?: number }
  /** Sandbox's Entropy-containment slot. Diverting a resolving Entropy into it
   *  blanks that card while held (owner ruling, 2026-08-13). */
  slot?: { capacity: number } & MaybeUnimplemented
  rulesText: string
}

/** A Model (design §4): free one comes in at setup, upgradeable.
 *  BEST-GUESS(Q11): models are free-resource engines. */
export interface ModelDef {
  id: string
  name: string
  traits?: string[]
  grants: Pip[]
  /**
   * A printed ability whose COST is Entropy (Fable's "Entropy 1:"). Paying it
   * feeds that many cards from the Entropy deck onto the stack — the same
   * currency every other action feeds (owner ruling, 2026-08-13).
   */
  activated?: { cost: { entropy: number }; gain: Pip[] }
  rulesText: string
}

/**
 * The framework in the command zone (design §4). Always in play.
 *
 * Mastra's ability is PASSIVE, not activated: the first card with
 * `freeTrait` played each round costs nothing and feeds no Entropy.
 */
export interface FrameworkDef {
  id: string
  name: string
  /** Trait whose first play each round is free (cost and Entropy). */
  freeTrait: string
  rulesText: string
}
