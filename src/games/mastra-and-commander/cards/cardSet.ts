/**
 * The first playable card set — the owner's 2026-08-13 rules pass.
 *
 * Transcribed from `../mastra-and-commander/cards/cards.yml`, which is the
 * source of truth for card content. Names, traits, pips, contributions and
 * rules text here must match the printed face; the engine only adds the
 * machine-readable payload (`call`, `event`, `entropyEffect`, …) that the
 * printed text describes in prose.
 *
 * SCOPE (owner, 2026-08-13): this set is for roughing out the opening turns,
 * not for playing a balanced three-eval match. It is 15 distinct cards, so
 * decks are built by repeating them (see DECK_RECIPE). Where a card's printed
 * text needs a mechanic the engine does not have yet, the payload says so
 * explicitly with `unimplemented` rather than quietly doing nothing — the board
 * surfaces those, so a half-built card can never masquerade as a working one.
 *
 * Pip keys stay capital/attention/technology/generic; they PRINT as Value /
 * Attention / Automation / Wild (see PIP_NAME).
 */
import type {
  EntropyCardDef, EvalCardDef, FeatureCardDef, FrameworkDef, LoadoutDef,
  ModelDef, OperatorCardDef, TokenDef,
} from './types'

// ── Framework ─────────────────────────────────────────────────────────────

export const MASTRA: FrameworkDef = {
  id: 'MASTRA',
  name: 'Mastra',
  freeTrait: 'Agent',
  rulesText: 'The first **Agent** played each round has no cost and incurs no Entropy.',
}

// ── Tokens ────────────────────────────────────────────────────────────────

/**
 * Agent — the only token in the set, and the thing that owns a Context row.
 *
 * Tokens are put into play by other cards, never drawn or paid for; they have
 * no cost, no output and no Contribution ("they do not act"). Playing one opens
 * a Context row; the first each round is free via Mastra.
 */
export const AGENT_TOKEN: TokenDef = {
  id: 'TOKEN-AGENT',
  name: 'Agent',
  traits: ['Agent'],
  rulesText: '',
}

// ── Operator cards ────────────────────────────────────────────────────────

export const OPERATOR_CARDS: OperatorCardDef[] = [
  {
    id: 'OP-AGENTBROWSER',
    name: 'AgentBrowser',
    supertype: 'persistent',
    traits: ['Tool'],
    consume: ['attention'],
    produce: ['technology', 'generic'],
    contributes: [{ color: 'amber', shape: 'pentagon' }],
    // "Call: Draw 1. Discard 1. Do not add entropy." — the no-entropy clause is
    // already true of every call, so it reads as reassurance, not an exception.
    call: { kind: 'drawThenDiscard', draw: 1, discard: 1 },
    // "MCP: Gain Durable" — installing as a server is what grants Durable, which
    // the install move already does.
    rulesText: '**Call:** Draw 1. Discard 1. Do not add entropy.\n**MCP:** Gain *Durable*.',
  },
  {
    id: 'OP-SOCIAL-MEDIA-MANAGER',
    name: 'Social Media Manager',
    supertype: 'persistent',
    traits: ['Skill'],
    consume: ['generic'],
    produce: ['attention'],
    contributes: [{ color: 'amber', shape: 'triangle' }],
    call: { kind: 'gainPips', pips: ['attention', 'attention'] },
    rulesText: '**Call:** Gain {attention}{attention}\n**Attach:** Gain *Durable*.',
  },
  {
    id: 'OP-HUMAN-IN-THE-LOOP',
    name: 'Human-in-the-Loop',
    supertype: 'ephemeral',
    traits: ['Response'],
    consume: ['attention', 'attention'],
    produce: ['capital', 'capital'],
    contributes: [{ color: 'pink', shape: 'circle' }],
    // BEST-GUESS: "Once:" read as once per round (the doc does not say).
    response: { kind: 'peekEntropyDeck', discardCost: 5 },
    rulesText: '**Once:** Look at the top card of the entropy deck. You may discard it. '
      + 'If you do, discard five cards from the top of the operator deck.',
  },
  {
    id: 'OP-Y-COMBINATOR',
    name: 'Y-Combinator',
    supertype: 'ephemeral',
    traits: ['Event'],
    consume: ['attention', 'technology'],
    produce: ['capital', 'capital', 'attention', 'attention', 'technology'],
    contributes: [{ color: 'violet', shape: 'circle' }],
    // Models / loadouts / features shuffle into the operator deck as findable
    // upgrades (owner ruling), which is what makes this tutor meaningful.
    event: { kind: 'tutor', traits: ['Model', 'Loadout', 'Feature'] },
    rulesText: 'Search your operator deck for a model, loadout, or feature card '
      + 'and play it without adding entropy.',
  },
]

// ── Features ──────────────────────────────────────────────────────────────

export const FEATURE_CARDS: FeatureCardDef[] = [
  {
    id: 'FEAT-PARALLELISM',
    name: 'Parallelism',
    traits: ['Concurrency'],
    // The only Agent source in the set besides Mastra's free first one.
    effect: { kind: 'spawnAgents', n: 2, entropy: 1 },
    rulesText: 'Spawn two subagents.\n**Resolve:** Only 1 entropy is added this way.',
  },
]

// ── Entropy ───────────────────────────────────────────────────────────────

export const ENTROPY_CARDS: EntropyCardDef[] = [
  {
    id: 'EN-TOKEN-LIMITER',
    name: 'Token Limiter',
    traits: ['Noise'],
    // Ongoing: every row's ceiling drops by 1 while this is on the threat row.
    effect: { kind: 'ongoing', ongoing: { kind: 'ceilingReduction', n: 1 } },
    rulesText: 'Maximum context per agent is reduced by 1.',
  },
  {
    id: 'EN-PII-LEAK',
    name: 'PII Leak',
    traits: ['Risk'],
    effect: {
      kind: 'ongoing',
      ongoing: { kind: 'blankProducersOf', pip: 'attention' },
      // BEST-GUESS: cumulative Value produced by cards discarded while this is
      // live. NOT WIRED YET — nothing counts discards toward it, so the card
      // never leaves on its own. Surfaced in the UI as unimplemented.
      trigger: { kind: 'discardedProduction', pip: 'capital', total: 5, unimplemented: true },
    },
    rulesText: '**Ongoing:** Cards that produce {attention} do not contribute to the '
      + 'current eval.\n**Trigger:** If cards producing at least 5 {value} are discarded '
      + 'from hand or context, discard this card.',
  },
  {
    id: 'EN-JAILBREAK',
    name: 'Jailbreak',
    traits: ['Subversion'],
    // "Initialize:" fires on resolution; the target is determined, not chosen —
    // highest automation production in play, leftmost on a tie.
    effect: { kind: 'initialize', initialize: { kind: 'attachAndBlank', by: 'technology' } },
    rulesText: '**Initialize:** Attach this card to your highest {automation} production '
      + 'card in play. That card no longer contributes to your eval.',
  },
  {
    id: 'EN-MODEL-COLLAPSE',
    name: 'Model Collapse',
    traits: ['Pollution'],
    effect: { kind: 'ongoing', ongoing: { kind: 'extraFeedOnProducer', pip: 'technology', n: 1 } },
    rulesText: '**Ongoing:** Generate an additional entropy whenever a card that '
      + 'produces {automation} enters the context.',
  },
]

// ── Evals ─────────────────────────────────────────────────────────────────

export const EVAL_CARDS: EvalCardDef[] = [
  {
    id: 'EV-PERSONAL-TECH-SUPPORT',
    name: 'Personal Tech Support',
    difficulty: 1,
    par: 4,
    // hand: [cyan/*, cyan/*, amber/*]
    patterns: [
      { kind: 'countOfColor', color: 'cyan', n: 2 },
      { kind: 'countOfColor', color: 'amber', n: 1 },
    ],
    rulesText: '"How do I set my microwave clock?"\n"Are smart watches waterproof?"\n'
      + '"My smart light won\'t turn off."',
  },
  {
    id: 'EV-RECRUITER-AGENT',
    name: 'Recruiter Agent',
    difficulty: 2,
    par: 5,
    // hand: [violet/*, violet/*, violet/*, amber/*]
    patterns: [
      { kind: 'countOfColor', color: 'violet', n: 3 },
      { kind: 'countOfColor', color: 'amber', n: 1 },
    ],
    rulesText: '"I need a founding senior engineer, part time, seven years of Mastra '
      + 'experience..."',
  },
]

// ── Models & loadout ──────────────────────────────────────────────────────

export const MODEL_CARDS: ModelDef[] = [
  {
    id: 'MODEL-FABLE',
    name: 'Fable',
    traits: ['Model', 'Anthropic'],
    grants: [],
    // "Entropy 1:" is a COST — feed one Entropy card to the stack, then gain.
    activated: { cost: { entropy: 1 }, gain: ['attention', 'technology'] },
    rulesText: '**Entropy 1:** Gain {attention}{automation}.',
  },
]

export const LOADOUT_CARDS: LoadoutDef[] = [
  {
    id: 'LOADOUT-SANDBOX',
    name: 'Sandbox',
    traits: ['Loadout'],
    grants: [],
    activated: { cost: { pips: ['capital', 'attention'] }, gain: ['technology'], mill: 1 },
    // NOT WIRED YET: diverting a resolving Entropy into the slot.
    slot: { capacity: 1, unimplemented: true },
    rulesText: '{value}{attention}: Discard the top card of your operator deck. '
      + 'Gain {automation}.\n\n**Slot:** This card can hold 1 Entropy. While a card is '
      + 'held here its text box is blank.',
  },
]

/**
 * How many copies of each card a deck gets.
 *
 * Fifteen distinct cards is far too few to fill a match, so the opening-turns
 * build simply repeats them. These counts are for HAVING CARDS TO DRAW, not for
 * balance — expect most draws to repeat until the set grows.
 */
export const DECK_RECIPE = {
  /** Operator deck: the four operator cards, plus findable upgrades. */
  operator: {
    'OP-AGENTBROWSER': 5,
    'OP-SOCIAL-MEDIA-MANAGER': 5,
    'OP-HUMAN-IN-THE-LOOP': 4,
    'OP-Y-COMBINATOR': 3,
    // Upgrades live in the operator deck so Y-Combinator's tutor can find them
    // (owner ruling). One of each is already in play at setup.
    'MODEL-FABLE': 2,
    'LOADOUT-SANDBOX': 2,
    'FEAT-PARALLELISM': 3,
  } as Record<string, number>,
  /** Entropy deck — the stack draws from here all match. */
  entropy: {
    'EN-TOKEN-LIMITER': 4,
    'EN-PII-LEAK': 3,
    'EN-JAILBREAK': 4,
    'EN-MODEL-COLLAPSE': 4,
  } as Record<string, number>,
  /** Objectives, one revealed per round. */
  evals: ['EV-PERSONAL-TECH-SUPPORT', 'EV-RECRUITER-AGENT'] as string[],
} as const

/** Expand a recipe into a flat list of card ids. */
export function expandRecipe(recipe: Record<string, number>): string[] {
  const out: string[] = []
  for (const [id, count] of Object.entries(recipe)) {
    for (let i = 0; i < count; i++) out.push(id)
  }
  return out
}
