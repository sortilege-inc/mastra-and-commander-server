/**
 * The payment algebra — design §4's pitch economy.
 *
 * These are the rules most likely to change (the owner flagged the I/O flow as
 * provisional), so they get the densest coverage: when the flow is reworked,
 * these tests are the spec that has to be rewritten alongside it.
 */
import { describe, expect, it } from 'vitest'
import {
  lastPayingSlot, pitchEntropyFor, planPayment, toPipCounts, totalPips, zeroPips,
} from './ioFlow'
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

describe('pitchEntropyFor — the 1/2/3 contribution scale', () => {
  // Agent contributes cyan ●; Subagent cyan ▲; Workflow-A amber ●;
  // Durable Agent green ⬟.
  const agent = getOperatorCard('TEST-OP-AGENT')

  it('charges 1 for an exact match (same color AND shape)', () => {
    const result = pitchEntropyFor(agent, agent)
    expect(result.match).toBe('exact')
    expect(result.entropy).toBe(1)
  })

  it('charges 2 for a color-only match', () => {
    const result = pitchEntropyFor(getOperatorCard('TEST-OP-SUBAGENT'), agent)
    expect(result.match).toBe('partial')
    expect(result.entropy).toBe(2)
  })

  it('charges 2 for a shape-only match', () => {
    const result = pitchEntropyFor(getOperatorCard('TEST-OP-WORKFLOW-A'), agent)
    expect(result.match).toBe('partial')
    expect(result.entropy).toBe(2)
  })

  it('charges 3 when neither matches', () => {
    const result = pitchEntropyFor(getOperatorCard('TEST-OP-DURABLE-AGENT'), agent)
    expect(result.match).toBe('none')
    expect(result.entropy).toBe(3)
  })

  it('takes the BEST match across multi-contribution cards', () => {
    // Supervisor contributes cyan ■ AND cyan ● — the latter matches Agent
    // exactly, so it should be priced as exact, not partial.
    const result = pitchEntropyFor(getOperatorCard('TEST-OP-SUPERVISOR'), agent)
    expect(result.match).toBe('exact')
  })

  it('falls to the `none` tier with nothing to compare against', () => {
    expect(pitchEntropyFor(agent, null).match).toBe('none')
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

  it('assigns constrained typed pips before generic ones', () => {
    // Cost is technology + generic. Only the Agent can pay technology, so the
    // assignment must not waste it on the generic pip.
    const result = planPayment(['technology', 'generic'], noSources(), [
      getOperatorCard('TEST-OP-SCRATCHPAD'), // cost [] — generic only
      getOperatorCard('TEST-OP-AGENT'),      // cost [technology]
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.pitches).toHaveLength(2)
  })
})

describe('planPayment — pitching is always legal', () => {
  it('accepts a card whose cost shares nothing with the pip', () => {
    // Under the old rule this was illegal. Now it is merely priced.
    const result = planPayment(
      ['capital'], noSources(), [getOperatorCard('TEST-OP-AGENT')],
      getOperatorCard('TEST-OP-AGENT'),
    )
    expect(result.ok).toBe(true)
  })

  it('prices each pitch off the card being paid for', () => {
    const agent = getOperatorCard('TEST-OP-AGENT')
    const result = planPayment(
      ['capital', 'capital'], noSources(),
      [agent, getOperatorCard('TEST-OP-DURABLE-AGENT')],
      agent,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Agent vs Agent = exact (1); Durable Agent (green ⬟) vs Agent = none (3).
    expect(result.plan.pitches.map((p) => p.entropy)).toEqual([1, 3])
  })

  it('still requires exactly one pitch per unmet pip', () => {
    const result = planPayment(['technology', 'capital'], noSources(), [
      getOperatorCard('TEST-OP-SCRATCHPAD'),
    ])
    expect(result.ok).toBe(false)
  })
})

describe('lastPayingSlot — face-down cards are skipped for I/O', () => {
  it('looks through a face-down call to the last face-up card', () => {
    const slots = [
      { faceDown: false, id: 'a' },
      { faceDown: true, id: 'call' },
    ]
    expect(lastPayingSlot(slots)?.id).toBe('a')
  })

  it('returns undefined when every slot is face-down', () => {
    expect(lastPayingSlot([{ faceDown: true, id: 'call' }])).toBeUndefined()
  })

  it('returns undefined for an empty chain', () => {
    expect(lastPayingSlot([])).toBeUndefined()
  })
})

describe('planPayment — ecosystem discount', () => {
  it('waives generic pips up to the discount', () => {
    const result = planPayment(['generic', 'generic'], noSources(), [], null, 1)
    expect(result.ok).toBe(false) // one generic still unpaid, no pitch offered

    const withPitch = planPayment(['generic', 'generic'], noSources(), [
      getOperatorCard('TEST-OP-AGENT'),
    ], null, 1)
    expect(withPitch.ok).toBe(true)
    if (!withPitch.ok) return
    expect(withPitch.plan.discounted).toBe(1)
  })

  it('never discounts more generic pips than the cost contains', () => {
    const result = planPayment(['generic'], noSources(), [], null, 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.discounted).toBe(1)
  })

  it('does not discount typed pips', () => {
    const result = planPayment(['technology'], noSources(), [], null, 3)
    expect(result.ok).toBe(false)
  })
})
