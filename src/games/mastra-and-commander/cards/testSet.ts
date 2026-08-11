/**
 * Synthetic placeholder card set.
 *
 * ⚠ NONE OF THIS IS CANONICAL CARD DESIGN. Every id is `TEST-` prefixed to make
 * that unmissable. The real card roster lives in
 * ../../../../mastra-and-commander/cards/cards.yml and its mechanics are the
 * owner's card-design pass — explicitly not ours. These exist ONLY to exercise
 * the engine: every subsystem (chains, pitching, ecosystems, servers, RAG, claw,
 * processes, features, models, all three wrench vectors, every eval pattern)
 * needs at least one card that reaches it.
 *
 * The commander below is likewise a placeholder: the printed Mastra card is
 * pending a redesign (owner, 2026-08-10) and is deliberately NOT implemented.
 *
 * Numbers here are chosen for testability, not balance.
 */
import type {
  CommanderDef, EntropyCardDef, EquipmentDef, EvalCardDef, FeatureCardDef,
  ModelDef, OperatorCardDef,
} from './types'
import type { Color, Contribution, Shape } from '../constants'

/** Terse contribution constructor — this file would be unreadable otherwise. */
const c = (color: Color, shape: Shape): Contribution => ({ color, shape })

// ── Commander (placeholder) ───────────────────────────────────────────────

export const MASTRA_COMMANDER: CommanderDef = {
  id: 'MASTRA',
  name: 'Mastra',
  freeTrait: 'Agent',
  rulesText: 'The first **Agent** played each round has no cost and incurs no Entropy.',
}

// ── Operator cards ────────────────────────────────────────────────────────

export const OPERATOR_CARDS: OperatorCardDef[] = [
  {
    id: 'TEST-OP-SCRATCHPAD',
    name: 'Scratchpad',
    supertype: 'ephemeral',
    traits: ['Utility'],
    consume: [],
    produce: ['generic'],
    contributes: [c('pink', 'triangle')],
    rulesText: 'A free chain starter. Costs nothing, produces one **generic**.',
  },
  {
    id: 'TEST-OP-AGENT',
    name: 'Agent',
    supertype: 'ephemeral',
    traits: ['Agent'],
    consume: ['technology'],
    produce: ['attention'],
    contributes: [c('cyan', 'circle')],
    ecosystem: 'anthropic',
    rulesText: 'The basic unit of work.',
  },
  {
    id: 'TEST-OP-SUBAGENT',
    name: 'Subagent',
    supertype: 'ephemeral',
    // The Subagent trait opens a nested context whose cards don't count against
    // the parent window's ceiling.
    traits: ['Agent', 'Subagent'],
    consume: ['technology', 'generic'],
    produce: ['attention', 'generic'],
    contributes: [c('cyan', 'triangle')],
    ecosystem: 'anthropic',
    rulesText: 'Delegate a slice of the work. Discounted alongside other Anthropic cards.',
  },
  {
    id: 'TEST-OP-SUPERVISOR',
    name: 'Supervisor Agent',
    supertype: 'ephemeral',
    traits: ['Agent'],
    consume: ['technology', 'technology', 'generic'],
    produce: ['attention', 'attention'],
    contributes: [c('cyan', 'square'), c('cyan', 'circle')],
    entropyFeed: 2,
    ecosystem: 'anthropic',
    rulesText: 'Coordinates subagents. Feeds 2 Entropy — coordination is disorder.',
  },
  {
    id: 'TEST-OP-SWARM',
    name: 'Agent Swarm',
    supertype: 'ephemeral',
    traits: ['Agent'],
    consume: ['technology', 'technology', 'attention'],
    produce: ['attention', 'attention', 'generic'],
    contributes: [c('cyan', 'pentagon'), c('cyan', 'square'), c('cyan', 'circle')],
    entropyFeed: 3,
    rulesText: 'Maximum throughput, maximum disorder. Feeds 3 Entropy.',
  },
  {
    id: 'TEST-OP-TOOL-WEBSEARCH',
    name: 'Web Search Tool',
    supertype: 'persistent',
    traits: ['Tool'],
    consume: ['attention'],
    produce: ['technology', 'generic'],
    contributes: [c('amber', 'circle')],
    ecosystem: 'oss',
    rulesText: 'Installable onto a server.',
  },
  {
    id: 'TEST-OP-SKILL-SUMMARIZE',
    name: 'Summarize Skill',
    supertype: 'persistent',
    traits: ['Skill'],
    consume: ['generic'],
    produce: ['attention'],
    contributes: [c('amber', 'triangle')],
    rulesText: 'Installable onto a server.',
  },
  {
    id: 'TEST-OP-MCP-FILESYSTEM',
    name: 'Filesystem MCP',
    supertype: 'persistent',
    traits: ['MCP'],
    consume: ['technology'],
    produce: ['generic', 'generic'],
    contributes: [c('amber', 'square')],
    ecosystem: 'oss',
    rulesText: 'Installable onto a server.',
  },
  {
    id: 'TEST-OP-FUNDING',
    name: 'Got Into YC',
    supertype: 'ephemeral',
    traits: ['Event'],
    consume: ['generic'],
    produce: ['capital', 'capital'],
    contributes: [c('violet', 'circle')],
    entropyFeed: 2,
    event: { kind: 'draw', n: 1 },
    rulesText: 'Funding windfall: draw a card. Feeds 2 Entropy.',
  },
  {
    id: 'TEST-OP-PARALLELISM',
    name: 'Parallelism',
    supertype: 'ephemeral',
    traits: ['Event'],
    consume: ['attention', 'generic'],
    produce: [],
    contributes: [c('violet', 'triangle')],
    event: { kind: 'openProcess' },
    rulesText: 'Open an additional concurrent Process this round.',
  },
  {
    id: 'TEST-OP-DURABLE-AGENT',
    name: 'Durable Agent',
    supertype: 'persistent',
    traits: ['Agent'],
    consume: ['capital', 'technology'],
    produce: ['attention'],
    contributes: [c('green', 'pentagon')],
    keywords: ['durable'],
    rulesText: '**Durable** — relays to the next round without feeding Entropy.',
  },
  {
    id: 'TEST-OP-SETUP-PIPELINE',
    name: 'Ingestion Pipeline',
    supertype: 'persistent',
    traits: ['Infrastructure'],
    consume: ['capital', 'capital'],
    produce: ['generic'],
    contributes: [c('green', 'circle')],
    keywords: ['setup'],
    rulesText: '**Setup** — scrap it on a failed eval to shed 5 Entropy.',
  },
  {
    id: 'TEST-OP-GUARDRAIL',
    name: 'Guardrails',
    supertype: 'ephemeral',
    traits: ['Response'],
    consume: ['attention'],
    produce: [],
    contributes: [c('pink', 'circle')],
    response: { kind: 'cleansePollution', n: 2 },
    rulesText: '**Response:** remove up to 2 injected contributions.',
  },
  {
    id: 'TEST-OP-PATCH',
    name: 'Hotfix',
    supertype: 'ephemeral',
    traits: ['Response'],
    consume: ['technology'],
    produce: [],
    contributes: [c('pink', 'square')],
    response: { kind: 'restoreSubverted' },
    rulesText: '**Response:** restore one subverted card in the Context.',
  },
  {
    id: 'TEST-OP-MODEL-FRONTIER',
    name: 'Frontier Model',
    supertype: 'persistent',
    traits: ['Model'],
    consume: ['capital', 'capital', 'technology'],
    produce: [],
    contributes: [c('violet', 'square')],
    rulesText: '**Upgrade:** replaces your installed model. Grants **attention** and a **generic** each round.',
  },
  {
    id: 'TEST-OP-WORKFLOW-A',
    name: 'Chunking Step',
    supertype: 'ephemeral',
    traits: ['Workflow'],
    consume: ['generic'],
    produce: ['generic'],
    contributes: [c('amber', 'circle')],
    rulesText: 'A cheap link in the chain.',
  },
  {
    id: 'TEST-OP-WORKFLOW-B',
    name: 'Embedding Step',
    supertype: 'ephemeral',
    traits: ['Workflow'],
    consume: ['generic'],
    produce: ['generic'],
    contributes: [c('amber', 'triangle')],
    rulesText: 'A cheap link in the chain.',
  },
  {
    id: 'TEST-OP-WORKFLOW-C',
    name: 'Indexing Step',
    supertype: 'ephemeral',
    traits: ['Workflow'],
    consume: ['generic'],
    produce: ['generic'],
    contributes: [c('amber', 'square')],
    rulesText: 'A cheap link in the chain.',
  },
]

// ── Entropy cards (all three wrench vectors of design §5) ─────────────────

export const ENTROPY_CARDS: EntropyCardDef[] = [
  {
    id: 'TEST-EN-STATIC',
    name: 'Static',
    traits: ['Noise'],
    effect: { kind: 'none' },
    rulesText: 'Nothing happens. This time.',
  },
  {
    id: 'TEST-EN-HALLUCINATION',
    name: 'Hallucination',
    traits: ['Pollution'],
    effect: { kind: 'pollute', junk: [c('pink', 'hexagon')] },
    rulesText: 'Pollute: inject one junk contribution into the Context.',
  },
  {
    id: 'TEST-EN-SLOP',
    name: 'Model Collapse',
    traits: ['Pollution'],
    effect: { kind: 'pollute', junk: [c('pink', 'hexagon'), c('pink', 'pentagon')] },
    rulesText: 'Pollute: inject two junk contributions.',
  },
  {
    id: 'TEST-EN-PROMPT-INJECTION',
    name: 'Prompt Injection',
    traits: ['Subversion'],
    effect: { kind: 'subvert' },
    rulesText: 'Subvert: blank a card\'s contributions this round.',
  },
  {
    id: 'TEST-EN-JAILBREAK',
    name: 'Jailbreak',
    traits: ['Subversion'],
    effect: { kind: 'subvert' },
    rulesText: 'Subvert: blank a card\'s contributions this round.',
  },
  {
    id: 'TEST-EN-REWARD-HACKING',
    name: 'Reward Hacking',
    traits: ['Hijack'],
    effect: { kind: 'hijack' },
    rulesText: 'Goal-hijack: swap the objective you are scored against.',
  },
  {
    id: 'TEST-EN-OUTAGE',
    name: 'GPU Unavailability',
    traits: ['Subversion'],
    effect: { kind: 'attackServer' },
    rulesText: 'Destroy an installed server.',
  },
  {
    id: 'TEST-EN-EXPORT-CONTROLS',
    name: 'Export Controls',
    traits: ['Targeted'],
    effect: { kind: 'ecosystemTax', ecosystem: 'oss' },
    rulesText: 'Targeted: subvert every open-source card in play.',
  },
  {
    id: 'TEST-EN-DISTRACTION',
    name: 'Rate Limited',
    traits: ['Noise'],
    effect: { kind: 'discardRandomFromHand' },
    rulesText: 'The Operator discards a card at random.',
  },
  {
    id: 'TEST-EN-CASCADE',
    name: 'Cascading Failure',
    traits: ['Noise'],
    effect: { kind: 'feedExtra', n: 1 },
    rulesText: 'Feed one more Entropy card onto the stack.',
  },
]

// ── Eval cards (covering every pattern kind and all three difficulties) ───

export const EVAL_CARDS: EvalCardDef[] = [
  {
    id: 'TEST-EV-TRIPLE-CYAN',
    name: 'Ship an Agent',
    patterns: [{ kind: 'countOfColor', color: 'cyan', n: 3 }],
    par: 4,
    difficulty: 1,
    rulesText: 'Three cyan contributions.',
  },
  {
    id: 'TEST-EV-PAIR-SHAPES',
    name: 'Consistency Check',
    patterns: [{ kind: 'nOfAShape', n: 2 }],
    par: 3,
    difficulty: 1,
    rulesText: 'Two contributions sharing a shape.',
  },
  {
    id: 'TEST-EV-NO-PINK',
    name: 'Clean Output',
    patterns: [
      { kind: 'countAny', n: 4 },
      { kind: 'noColor', color: 'pink' },
    ],
    par: 5,
    difficulty: 2,
    rulesText: 'Four contributions, none pink. (Pollution spoils this.)',
  },
  {
    id: 'TEST-EV-RUN-3',
    name: 'Pipeline Integrity',
    patterns: [{ kind: 'runOfShapes', len: 3 }],
    par: 5,
    superiorAt: 4,
    difficulty: 2,
    rulesText: 'A run of three consecutive shapes.',
  },
  {
    id: 'TEST-EV-FULL-HOUSE',
    name: 'Balanced Portfolio',
    patterns: [{ kind: 'fullHouse' }],
    par: 6,
    difficulty: 3,
    rulesText: 'Three of one color plus two of another.',
  },
  {
    id: 'TEST-EV-FLUSH-5',
    name: 'Total Alignment',
    patterns: [{ kind: 'countOfColor', n: 5 }],
    par: 6,
    superiorAt: 5,
    difficulty: 3,
    rulesText: 'Five contributions of a single color.',
  },
]

// ── Features, equipment, models ───────────────────────────────────────────

export const FEATURE_CARDS: FeatureCardDef[] = [
  {
    id: 'TEST-FEAT-STREAMING',
    name: 'Streaming',
    effect: { kind: 'drawNow', n: 1 },
    rulesText: 'Draw a card when selected.',
  },
  {
    id: 'TEST-FEAT-CACHING',
    name: 'Prompt Caching',
    effect: { kind: 'grantPip', pip: 'technology' },
    rulesText: 'Gain **technology** this round.',
  },
  {
    id: 'TEST-FEAT-TRACING',
    name: 'Tracing',
    effect: { kind: 'ignoreFirstFeed' },
    rulesText: 'Ignore the next Entropy feed this round.',
  },
  {
    id: 'TEST-FEAT-EVALS',
    name: 'Evals',
    effect: { kind: 'grantPip', pip: 'attention' },
    rulesText: 'Gain **attention** this round.',
  },
]

export const EQUIPMENT: EquipmentDef[] = [
  {
    id: 'TEST-EQ-LOCAL-RIG',
    name: 'Local Rig',
    grants: ['technology'],
    rulesText: 'Auto-pitches the top card of your deck each round; grants **technology**.',
  },
  {
    id: 'TEST-EQ-CLOUD',
    name: 'Mastra Cloud',
    grants: ['capital'],
    rulesText: 'Auto-pitches the top card of your deck each round; grants **capital**.',
  },
]

export const MODELS: ModelDef[] = [
  {
    id: 'TEST-MODEL-SMALL',
    name: 'Small Model',
    grants: [],
    rulesText: 'Your free starting model. Grants nothing.',
  },
  {
    id: 'TEST-MODEL-FRONTIER',
    name: 'Frontier Model',
    grants: ['attention', 'generic'],
    rulesText: 'Grants **attention** and a **generic** each round.',
  },
]

// ── Deck lists ────────────────────────────────────────────────────────────
// Multiplicities chosen so a 5-card opening hand can reliably start a chain and
// the deck outlasts a 5-round match.

/** Operator deck: id → copies. */
export const OPERATOR_DECK_LIST: Array<[string, number]> = [
  ['TEST-OP-SCRATCHPAD', 4],
  ['TEST-OP-AGENT', 4],
  ['TEST-OP-SUBAGENT', 3],
  ['TEST-OP-SUPERVISOR', 2],
  ['TEST-OP-SWARM', 1],
  ['TEST-OP-TOOL-WEBSEARCH', 2],
  ['TEST-OP-SKILL-SUMMARIZE', 2],
  ['TEST-OP-MCP-FILESYSTEM', 2],
  ['TEST-OP-FUNDING', 2],
  ['TEST-OP-PARALLELISM', 2],
  ['TEST-OP-DURABLE-AGENT', 2],
  ['TEST-OP-SETUP-PIPELINE', 2],
  ['TEST-OP-GUARDRAIL', 2],
  ['TEST-OP-PATCH', 2],
  ['TEST-OP-MODEL-FRONTIER', 1],
  ['TEST-OP-WORKFLOW-A', 3],
  ['TEST-OP-WORKFLOW-B', 3],
  ['TEST-OP-WORKFLOW-C', 3],
]

/** Entropy deck: id → copies. */
export const ENTROPY_DECK_LIST: Array<[string, number]> = [
  ['TEST-EN-STATIC', 4],
  ['TEST-EN-HALLUCINATION', 4],
  ['TEST-EN-SLOP', 2],
  ['TEST-EN-PROMPT-INJECTION', 3],
  ['TEST-EN-JAILBREAK', 2],
  ['TEST-EN-REWARD-HACKING', 2],
  ['TEST-EN-OUTAGE', 2],
  ['TEST-EN-EXPORT-CONTROLS', 2],
  ['TEST-EN-DISTRACTION', 2],
  ['TEST-EN-CASCADE', 2],
]

/** Expand an [id, copies] list into a flat array of ids. */
export function expandDeckList(list: Array<[string, number]>): string[] {
  const out: string[] = []
  for (const [id, copies] of list) {
    for (let i = 0; i < copies; i++) out.push(id)
  }
  return out
}
