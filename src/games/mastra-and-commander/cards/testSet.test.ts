/**
 * Card data integrity.
 *
 * These are cheap structural guarantees that catch the failure mode this data
 * shape invites: a deck list naming a card that doesn't exist, or a card whose
 * printed values exceed what the frame can render.
 */
import { describe, expect, it } from 'vitest'
import {
  ENTROPY_CARDS, ENTROPY_DECK_LIST, LOADOUT, EVAL_CARDS, FEATURE_CARDS,
  MASTRA_FRAMEWORK, MODELS, OPERATOR_CARDS, OPERATOR_DECK_LIST, expandDeckList,
} from './testSet'
import {
  ALL_CARD_IDS, getEntropyCard, getEvalCard, getOperatorCard,
} from './registry'
import { LOADOUT_IDS, STARTING_MODEL_ID } from '../constants'

describe('registry integrity', () => {
  it('has no duplicate ids anywhere', () => {
    const ids = ALL_CARD_IDS()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('marks every card as synthetic with the TEST- prefix', () => {
    // The real roster is the owner's card-design pass; nothing here should ever
    // be mistaken for it.
    for (const id of ALL_CARD_IDS()) {
      // Mastra is the one real, named card — its ability is owner-specified.
      if (id === 'MASTRA') continue
      expect(id.startsWith('TEST-')).toBe(true)
    }
  })

  it('throws on an unknown id rather than returning undefined', () => {
    expect(() => getOperatorCard('NOPE')).toThrow(/Unknown operator/)
  })
})

describe('operator cards respect the printed frame', () => {
  it('never exceeds 5 consume or 5 produce slots', () => {
    for (const def of OPERATOR_CARDS) {
      expect(def.consume.length).toBeLessThanOrEqual(5)
      expect(def.produce.length).toBeLessThanOrEqual(5)
    }
  })

  it('never exceeds 3 contribution slots', () => {
    for (const def of OPERATOR_CARDS) {
      expect(def.contributes.length).toBeLessThanOrEqual(3)
    }
  })

  it('feeds at least one Entropy when it declares a feed', () => {
    for (const def of OPERATOR_CARDS) {
      if (def.entropyFeed !== undefined) expect(def.entropyFeed).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every Event and Response card its effect payload', () => {
    for (const def of OPERATOR_CARDS) {
      if (def.traits.includes('Event')) expect(def.event).toBeDefined()
      if (def.traits.includes('Response')) expect(def.response).toBeDefined()
    }
  })
})

describe('deck lists resolve', () => {
  it('every Operator deck entry is a real card', () => {
    for (const id of expandDeckList(OPERATOR_DECK_LIST)) {
      expect(() => getOperatorCard(id)).not.toThrow()
    }
  })

  it('every Entropy deck entry is a real card', () => {
    for (const id of expandDeckList(ENTROPY_DECK_LIST)) {
      expect(() => getEntropyCard(id)).not.toThrow()
    }
  })

  it('builds a deck big enough to outlast a match', () => {
    // 5 rounds of draws, pitches, and 2 loadout mills per round.
    expect(expandDeckList(OPERATOR_DECK_LIST).length).toBeGreaterThan(30)
    expect(expandDeckList(ENTROPY_DECK_LIST).length).toBeGreaterThan(20)
  })
})

describe('constants point at real cards', () => {
  it('the loadout ids exist', () => {
    for (const id of LOADOUT_IDS) {
      expect(LOADOUT.some((e) => e.id === id)).toBe(true)
    }
  })

  it('the starting model exists', () => {
    expect(MODELS.some((m) => m.id === STARTING_MODEL_ID)).toBe(true)
  })

  it('the framework is Mastra, granting a free Agent each round', () => {
    expect(MASTRA_FRAMEWORK.id).toBe('MASTRA')
    expect(MASTRA_FRAMEWORK.freeTrait).toBe('Agent')
  })
})

describe('eval cards', () => {
  it('every eval has at least one pattern and a sane par', () => {
    for (const def of EVAL_CARDS) {
      expect(def.patterns.length).toBeGreaterThan(0)
      expect(def.par).toBeGreaterThan(0)
      if (def.superiorAt !== undefined) {
        // Superior must be strictly harder than par.
        expect(def.superiorAt).toBeLessThanOrEqual(def.par)
      }
    }
  })

  it('covers all three difficulty tiers', () => {
    const tiers = new Set(EVAL_CARDS.map((e) => e.difficulty))
    expect(tiers).toEqual(new Set([1, 2, 3]))
  })

  it('resolves through the registry', () => {
    for (const def of EVAL_CARDS) {
      expect(getEvalCard(def.id).name).toBe(def.name)
    }
  })
})

describe('entropy cards cover all three wrench vectors', () => {
  it('has pollution, subversion, and goal-hijack', () => {
    const kinds = new Set(ENTROPY_CARDS.map((c) => c.effect.kind))
    expect(kinds.has('pollute')).toBe(true)     // Pollution
    expect(kinds.has('subvert')).toBe(true)     // Subversion
    expect(kinds.has('hijack')).toBe(true)      // Goal-hijack
  })

  it('includes a targeted-ecosystem event', () => {
    expect(ENTROPY_CARDS.some((c) => c.effect.kind === 'ecosystemTax')).toBe(true)
  })
})

describe('features', () => {
  it('every feature has an effect', () => {
    for (const def of FEATURE_CARDS) expect(def.effect).toBeDefined()
  })
})
