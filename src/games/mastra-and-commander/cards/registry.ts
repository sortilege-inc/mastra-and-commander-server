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
  CommanderDef, EntropyCardDef, EquipmentDef, EvalCardDef, FeatureCardDef,
  ModelDef, OperatorCardDef,
} from './types'
import {
  ENTROPY_CARDS, EQUIPMENT, EVAL_CARDS, FEATURE_CARDS, MODELS, OPERATOR_CARDS,
  MASTRA_COMMANDER,
} from './testSet'

function index<T extends { id: string }>(defs: T[]): Record<string, T> {
  const map: Record<string, T> = {}
  for (const def of defs) {
    if (map[def.id]) throw new Error(`Duplicate card id in registry: ${def.id}`)
    map[def.id] = def
  }
  return map
}

const OPERATOR_BY_ID = index(OPERATOR_CARDS)
const ENTROPY_BY_ID = index(ENTROPY_CARDS)
const EVAL_BY_ID = index(EVAL_CARDS)
const FEATURE_BY_ID = index(FEATURE_CARDS)
const EQUIPMENT_BY_ID = index(EQUIPMENT)
const MODEL_BY_ID = index(MODELS)
const COMMANDER_BY_ID = index([MASTRA_COMMANDER])

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
  equipment: {
    id: HIDDEN_ID, name: 'Hidden equipment', grants: [], rulesText: '',
  } satisfies EquipmentDef,
  model: {
    id: HIDDEN_ID, name: 'Hidden model', grants: [], rulesText: '',
  } satisfies ModelDef,
  commander: {
    id: HIDDEN_ID, name: 'Hidden commander', freeTrait: '', rulesText: '',
  } satisfies CommanderDef,
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

export const getEquipment = (id: string): EquipmentDef =>
  get(EQUIPMENT_BY_ID, id, 'equipment')

export const getModel = (id: string): ModelDef =>
  get(MODEL_BY_ID, id, 'model')

export const getCommander = (id: string): CommanderDef =>
  get(COMMANDER_BY_ID, id, 'commander')

/** Non-throwing existence check — used by tests and by UI code that may hold a
 *  stale id from a saved game. */
export const hasOperatorCard = (id: string): boolean => id in OPERATOR_BY_ID

/** Every registered id, for integrity tests. */
export const ALL_CARD_IDS = (): string[] => [
  ...Object.keys(OPERATOR_BY_ID),
  ...Object.keys(ENTROPY_BY_ID),
  ...Object.keys(EVAL_BY_ID),
  ...Object.keys(FEATURE_BY_ID),
  ...Object.keys(EQUIPMENT_BY_ID),
  ...Object.keys(MODEL_BY_ID),
  ...Object.keys(COMMANDER_BY_ID),
]
