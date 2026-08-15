/**
 * Card registry — id → definition lookups.
 *
 * A plain static map. tcggg's L5R engine uses a code-generated lazy registry
 * (one Vite chunk per card) because it carries ~600 card modules; at this
 * scale that machinery would be pure overhead.
 *
 * Lookups THROW on a miss rather than returning undefined: an unknown card id
 * inside a move handler is a programming error (a deck list referencing a card
 * that doesn't exist), and failing loudly at the call site beats propagating an
 * undefined into the rules and corrupting state.
 */
import type {
  FrameworkDef, EntropyCardDef, LoadoutDef, EvalCardDef, FeatureCardDef,
  ModelDef, OperatorCardDef, TokenDef,
} from './types'
import {
  AGENT_TOKEN, ENTROPY_CARDS, EVAL_CARDS, FEATURE_CARDS, LOADOUT_CARDS,
  MASTRA, MODEL_CARDS, OPERATOR_CARDS, STUB_CARDS,
} from './cardSet'

function index<T extends { id: string }>(defs: T[]): Record<string, T> {
  const map: Record<string, T> = {}
  for (const def of defs) {
    if (map[def.id]) throw new Error(`Duplicate card id in registry: ${def.id}`)
    map[def.id] = def
  }
  return map
}

// Stubs are registered (so their ids and art resolve) but are not dealt.
const OPERATOR_BY_ID = index([...OPERATOR_CARDS, ...STUB_CARDS])
const ENTROPY_BY_ID = index(ENTROPY_CARDS)
const EVAL_BY_ID = index(EVAL_CARDS)
const FEATURE_BY_ID = index(FEATURE_CARDS)
const LOADOUT_BY_ID = index(LOADOUT_CARDS)
const MODEL_BY_ID = index(MODEL_CARDS)
const FRAMEWORK_BY_ID = index([MASTRA])
const TOKEN_BY_ID = index([AGENT_TOKEN])

/**
 * The sentinel playerView.ts substitutes for a card the viewer may not see.
 * Declared here (rather than imported) to keep cards/ free of engine imports.
 */
const HIDDEN_ID = 'HIDDEN'

/**
 * Placeholder definitions returned for the redaction sentinel.
 *
 * WHY THIS EXISTS: boardgame.io runs moves OPTIMISTICALLY on the client's
 * redacted copy of the state before the master's authoritative result syncs
 * back. A move that walks a redacted deck (e.g. roundRollover → enterReveal
 * shifting the eval deck) would otherwise throw on the sentinel and take the
 * client down. Lookups must therefore be total over redacted state: the
 * optimistic result may be briefly wrong — the master corrects it — but it must
 * never crash.
 */
const HIDDEN_DEFS: Record<string, unknown> = {
  operator: {
    id: HIDDEN_ID, name: 'Hidden card', supertype: 'ephemeral', traits: [],
    consume: [], produce: [], contributes: [], rulesText: '',
  } satisfies OperatorCardDef,
  entropy: {
    id: HIDDEN_ID, name: 'Hidden Entropy', traits: [],
    effect: { kind: 'none' }, rulesText: '',
  } satisfies EntropyCardDef,
  eval: {
    id: HIDDEN_ID, name: 'Hidden objective', patterns: [], par: 0,
    difficulty: 1, rulesText: '',
  } satisfies EvalCardDef,
  feature: {
    id: HIDDEN_ID, name: 'Hidden feature',
    effect: { kind: 'drawNow', n: 0 }, rulesText: '',
  } satisfies FeatureCardDef,
  loadout: {
    id: HIDDEN_ID, name: 'Hidden loadout', grants: [], rulesText: '',
  } satisfies LoadoutDef,
  model: {
    id: HIDDEN_ID, name: 'Hidden model', grants: [], rulesText: '',
  } satisfies ModelDef,
  framework: {
    id: HIDDEN_ID, name: 'Hidden framework', freeTrait: '', rulesText: '',
  } satisfies FrameworkDef,
}

function get<T>(map: Record<string, T>, id: string, kind: string): T {
  const def = map[id]
  if (def) return def
  if (id === HIDDEN_ID) return HIDDEN_DEFS[kind] as T
  throw new Error(`Unknown ${kind} card id: ${id}`)
}

export const getOperatorCard = (id: string): OperatorCardDef =>
  get(OPERATOR_BY_ID, id, 'operator')

export const getEntropyCard = (id: string): EntropyCardDef =>
  get(ENTROPY_BY_ID, id, 'entropy')

export const getEvalCard = (id: string): EvalCardDef =>
  get(EVAL_BY_ID, id, 'eval')

export const getFeatureCard = (id: string): FeatureCardDef =>
  get(FEATURE_BY_ID, id, 'feature')

export const getLoadout = (id: string): LoadoutDef =>
  get(LOADOUT_BY_ID, id, 'loadout')

export const getModel = (id: string): ModelDef =>
  get(MODEL_BY_ID, id, 'model')

export const getFramework = (id: string): FrameworkDef =>
  get(FRAMEWORK_BY_ID, id, 'framework')

/** Tokens are put into play by other cards; the Agent token owns a Context row. */
export const getToken = (id: string): TokenDef =>
  get(TOKEN_BY_ID, id, 'token')

/** True for a token id — tokens never occupy a slot or pay a cost, so callers
 *  must not route them through getOperatorCard. */
export const isToken = (id: string): boolean => id in TOKEN_BY_ID

/** Non-throwing existence check — used by tests and by UI code that may hold a
 *  stale id from a saved game. */
export const hasOperatorCard = (id: string): boolean => id in OPERATOR_BY_ID

/**
 * What KIND of card an id names.
 *
 * Since 2026-08-13 the operator deck holds models, loadouts and features as
 * findable upgrades, so a card in hand is no longer necessarily an operator
 * card — anything walking the hand must branch on this rather than assuming
 * getOperatorCard() will succeed.
 */
export type CardKind =
  | 'operator' | 'entropy' | 'eval' | 'feature'
  | 'loadout' | 'model' | 'framework' | 'token'

export function cardKindOf(id: string): CardKind | null {
  if (id in OPERATOR_BY_ID) return 'operator'
  if (id in ENTROPY_BY_ID) return 'entropy'
  if (id in EVAL_BY_ID) return 'eval'
  if (id in FEATURE_BY_ID) return 'feature'
  if (id in LOADOUT_BY_ID) return 'loadout'
  if (id in MODEL_BY_ID) return 'model'
  if (id in FRAMEWORK_BY_ID) return 'framework'
  if (id in TOKEN_BY_ID) return 'token'
  return null
}

/** Display name for a card of ANY kind. Safe on the redaction sentinel. */
export function cardName(id: string): string {
  const kind = cardKindOf(id)
  switch (kind) {
    case 'operator': return OPERATOR_BY_ID[id]!.name
    case 'entropy': return ENTROPY_BY_ID[id]!.name
    case 'eval': return EVAL_BY_ID[id]!.name
    case 'feature': return FEATURE_BY_ID[id]!.name
    case 'loadout': return LOADOUT_BY_ID[id]!.name
    case 'model': return MODEL_BY_ID[id]!.name
    case 'framework': return FRAMEWORK_BY_ID[id]!.name
    case 'token': return TOKEN_BY_ID[id]!.name
    default: return id === HIDDEN_ID ? 'Hidden' : id
  }
}

/**
 * An operator-shaped view of ANY card, for paths that must accept whatever is
 * in hand.
 *
 * Pitching is always legal (owner ruling), and since upgrades live in the
 * operator deck a pitched card may be a model, loadout or feature. Those have
 * no cost, output or Contribution, so they present as empty — which puts them
 * on the `none` tier of the pitch price, the most expensive. That falls out of
 * the rules rather than being a special case.
 */
export function asPitchable(id: string): OperatorCardDef {
  const kind = cardKindOf(id)
  if (kind === 'operator') return OPERATOR_BY_ID[id]!
  return {
    id,
    name: cardName(id),
    supertype: 'ephemeral',
    traits: [],
    consume: [],
    produce: [],
    contributes: [],
    rulesText: '',
  }
}

/** Every registered id, for integrity tests. */
export const ALL_CARD_IDS = (): string[] => [
  ...Object.keys(OPERATOR_BY_ID),
  ...Object.keys(ENTROPY_BY_ID),
  ...Object.keys(EVAL_BY_ID),
  ...Object.keys(FEATURE_BY_ID),
  ...Object.keys(LOADOUT_BY_ID),
  ...Object.keys(MODEL_BY_ID),
  ...Object.keys(FRAMEWORK_BY_ID),
  ...Object.keys(TOKEN_BY_ID),
]
