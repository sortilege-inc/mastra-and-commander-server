/**
 * The payment algebra — design §4's pitch economy.
 *
 * These are the rules most likely to change (the owner flagged the I/O flow as
 * provisional), so they get the densest coverage: when the flow is reworked,
 * these tests are the spec that has to be rewritten alongside it.
 */
import { describe, expect, it } from 'vitest'
import { canPitchFor, planPayment, toPipCounts, totalPips, zeroPips } from './ioFlow'
import { getOperatorCard } from '../cards/registry'

const noSources = () => ({ prevOutputs: zeroPips(), roundPool: zeroPips() })

describe('toPipCounts', () => {
  it('counts a pip list', () => {
    const counts = toPipCounts(['capital', 'capital', 'generic'])
    expect(counts.capital).toBe(2)
    expect(counts.generic).toBe(1)
    expect(totalPips(counts)).toBe(3)
  })
})

describe('canPitchFor', () => {
  const agent = getOperatorCard('TEST-OP-AGENT') // consume: [technology]

  it('accepts any card for a generic pip', () => {
    expect(canPitchFor(agent, 'generic')).toBe(true)
  })

  it('accepts a card whose own cost shares the type', () => {
    expect(canPitchFor(agent, 'technology')).toBe(true)
  })

  it('rejects a card whose cost does not share the type', () => {
    expect(canPitchFor(agent, 'capital')).toBe(false)
  })
})

describe('planPayment — free cards', () => {
  it('pays an empty cost with nothing', () => {
    const result = planPayment([], noSources(), [])
    expect(result.ok).toBe(true)
  })

  it('rejects surplus pitches for a free card', () => {
    const result = planPayment([], noSources(), [getOperatorCard('TEST-OP-AGENT')])
    expect(result.ok).toBe(false)
  })
})

describe('planPayment — paying from the previous card outputs', () => {
  it('spends the previous card outputs before the round pool', () => {
    const sources = {
      prevOutputs: toPipCounts(['technology']),
      roundPool: toPipCounts(['technology']),
    }
    const result = planPayment(['technology'], sources, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.fromPrevOutputs.technology).toBe(1)
    expect(result.plan.fromRoundPool.technology).toBe(0)
  })

  it('falls through to the round pool when outputs run short', () => {
    const sources = {
      prevOutputs: toPipCounts(['technology']),
      roundPool: toPipCounts(['technology']),
    }
    const result = planPayment(['technology', 'technology'], sources, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.fromPrevOutputs.technology).toBe(1)
    expect(result.plan.fromRoundPool.technology).toBe(1)
  })

  it('lets a typed unit pay a generic pip', () => {
    const sources = { prevOutputs: toPipCounts(['capital']), roundPool: zeroPips() }
    const result = planPayment(['generic'], sources, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.fromPrevOutputs.capital).toBe(1)
  })

  it('does NOT let a generic unit pay a typed pip', () => {
    const sources = { prevOutputs: toPipCounts(['generic']), roundPool: zeroPips() }
    // No pitches offered, so the typed pip is simply unpayable.
    const result = planPayment(['technology'], sources, [])
    expect(result.ok).toBe(false)
  })
})

describe('planPayment — pitching', () => {
  it('requires exactly one pitch per unmet pip', () => {
    const tooFew = planPayment(['technology', 'technology'], noSources(), [
      getOperatorCard('TEST-OP-AGENT'),
    ])
    expect(tooFew.ok).toBe(false)

    const exact = planPayment(['technology', 'technology'], noSources(), [
      getOperatorCard('TEST-OP-AGENT'),
      getOperatorCard('TEST-OP-AGENT'),
    ])
    expect(exact.ok).toBe(true)
  })

  it('rejects a pitch that does not share the pip type', () => {
    // Agent's cost is [technology]; it cannot pay a capital pip.
    const result = planPayment(['capital'], noSources(), [getOperatorCard('TEST-OP-AGENT')])
    expect(result.ok).toBe(false)
  })

  it('assigns constrained typed pips before generic ones', () => {
    // Cost is technology + generic. Only the Agent can pay technology, so the
    // greedy assignment must not waste it on the generic pip.
    const result = planPayment(['technology', 'generic'], noSources(), [
      getOperatorCard('TEST-OP-SCRATCHPAD'), // cost [] — generic only
      getOperatorCard('TEST-OP-AGENT'),      // cost [technology]
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.pitches).toHaveLength(2)
  })
})

describe('planPayment — ecosystem discount', () => {
  it('waives generic pips up to the discount', () => {
    const result = planPayment(['generic', 'generic'], noSources(), [], 1)
    expect(result.ok).toBe(false) // one generic still unpaid, no pitch offered

    const withPitch = planPayment(['generic', 'generic'], noSources(), [
      getOperatorCard('TEST-OP-AGENT'),
    ], 1)
    expect(withPitch.ok).toBe(true)
    if (!withPitch.ok) return
    expect(withPitch.plan.discounted).toBe(1)
  })

  it('never discounts more generic pips than the cost contains', () => {
    const result = planPayment(['generic'], noSources(), [], 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.discounted).toBe(1)
  })

  it('does not discount typed pips', () => {
    const result = planPayment(['technology'], noSources(), [], 3)
    expect(result.ok).toBe(false)
  })
})
