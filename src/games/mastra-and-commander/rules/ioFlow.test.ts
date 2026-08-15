/**
 * The payment algebra — the provisional-I/O quarantine's unit tests.
 *
 * These drive `planPayment` with hand-built pip lists rather than real cards
 * wherever the maths is the subject: the algebra is what is under test, and
 * tying it to a card's printed cost would make an unrelated balance tweak break
 * these. Real cards appear only where the PITCH PRICE is the subject, since
 * that is set by comparing printed Contributions.
 */
import { describe, expect, it } from 'vitest'
import {
  applyPlanToSources, chainOutputs, lastPayingSlot, pitchEntropyFor, planPayment,
  toPipCounts, totalPips, zeroPips,
} from './ioFlow'
import type { PaymentPlan } from './ioFlow'
import { getOperatorCard } from '../cards/registry'
import { CARDS } from '../testing/fixtures'
import { PITCH_ENTROPY } from '../constants'
import type { Pip } from '../constants'

const pips = (...list: Pip[]) => toPipCounts(list)
const noSources = () => ({ prevOutputs: zeroPips(), roundPool: zeroPips() })

/** planPayment, asserting it succeeded. */
function plan(
  cost: Pip[],
  sources = noSources(),
  pitchIds: string[] = [],
  payingFor: string | null = null,
): PaymentPlan {
  const result = planPayment(
    cost,
    sources,
    pitchIds.map(getOperatorCard),
    payingFor ? getOperatorCard(payingFor) : null,
  )
  if (!result.ok) throw new Error(`expected a payable plan, got: ${result.reason}`)
  return result.plan
}

describe('paying from sources', () => {
  it('costs nothing when the cost is empty', () => {
    const p = plan([])
    expect(totalPips(p.fromPrevOutputs)).toBe(0)
    expect(totalPips(p.fromRoundPool)).toBe(0)
    expect(p.pitches).toEqual([])
  })

  it('spends the previous card outputs before the round pool', () => {
    const sources = { prevOutputs: pips('attention'), roundPool: pips('attention') }
    const p = plan(['attention'], sources)
    expect(p.fromPrevOutputs.attention).toBe(1)
    expect(p.fromRoundPool.attention).toBe(0)
  })

  it('falls through to the round pool once outputs run out', () => {
    const sources = { prevOutputs: pips('attention'), roundPool: pips('attention') }
    const p = plan(['attention', 'attention'], sources)
    expect(p.fromPrevOutputs.attention).toBe(1)
    expect(p.fromRoundPool.attention).toBe(1)
  })

  it('lets a typed unit pay a wild pip', () => {
    const sources = { prevOutputs: pips('technology'), roundPool: zeroPips() }
    const p = plan(['generic'], sources)
    expect(p.fromPrevOutputs.technology).toBe(1)
  })

  it('does NOT let a wild unit pay a typed pip', () => {
    const sources = { prevOutputs: pips('generic'), roundPool: zeroPips() }
    const result = planPayment(['attention'], sources, [], null)
    // Unpayable from sources means it needs a pitch, and none was offered.
    expect(result.ok).toBe(false)
  })

  it('spends wild units on wild pips first, keeping typed units for typed pips', () => {
    const sources = {
      prevOutputs: pips('generic', 'attention'),
      roundPool: zeroPips(),
    }
    const p = plan(['generic', 'attention'], sources)
    expect(p.fromPrevOutputs.generic).toBe(1)
    expect(p.fromPrevOutputs.attention).toBe(1)
  })
})

describe('pitching', () => {
  it('requires exactly one pitch per unmet pip', () => {
    const tooFew = planPayment(['attention', 'attention'], noSources(),
      [getOperatorCard(CARDS.cheap)], null)
    expect(tooFew.ok).toBe(false)

    const tooMany = planPayment(['attention'], noSources(),
      [getOperatorCard(CARDS.cheap), getOperatorCard(CARDS.cheap)], null)
    expect(tooMany.ok).toBe(false)
  })

  it('accepts any card for any pip — pitching is always legal', () => {
    // The pitched card's own cost is irrelevant; only the count matters.
    const p = plan(['capital'], noSources(), [CARDS.cheap])
    expect(p.pitches).toHaveLength(1)
  })

  it('prices a pitch by how its Contribution matches the card being paid for', () => {
    // Same card on both sides: colour AND shape match, so the cheapest tier.
    const exact = pitchEntropyFor(
      getOperatorCard(CARDS.cheap), getOperatorCard(CARDS.cheap))
    expect(exact.match).toBe('exact')
    expect(exact.entropy).toBe(PITCH_ENTROPY.exact)
  })

  it('charges the partial tier when only one dimension matches', () => {
    // Social Media Manager is amber/triangle; Browserbase is amber/pentagon —
    // same colour, different shape.
    const partial = pitchEntropyFor(
      getOperatorCard(CARDS.cheap), getOperatorCard(CARDS.installable))
    expect(partial.match).toBe('partial')
    expect(partial.entropy).toBe(PITCH_ENTROPY.partial)
  })

  it('charges the most when nothing matches', () => {
    // Human-in-the-Loop is pink/circle — shares neither with amber/triangle.
    const none = pitchEntropyFor(
      getOperatorCard(CARDS.cheap), getOperatorCard(CARDS.response))
    expect(none.match).toBe('none')
    expect(none.entropy).toBe(PITCH_ENTROPY.none)
  })

  it('charges the most when there is nothing to compare against', () => {
    const orphan = pitchEntropyFor(getOperatorCard(CARDS.cheap), null)
    expect(orphan.match).toBe('none')
    expect(orphan.entropy).toBe(PITCH_ENTROPY.none)
  })
})

describe('the ecosystem discount', () => {
  it('waives wild pips, never typed ones', () => {
    const result = planPayment(['generic', 'attention'], noSources(),
      [getOperatorCard(CARDS.cheap)], null, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.discounted).toBe(1)
    // The typed pip still needs its pitch; only the wild one was waived.
    expect(result.plan.pitches).toHaveLength(1)
  })

  it('cannot waive more wild pips than the cost contains', () => {
    // A discount of 3 against a single wild pip clamps to 1 — and having
    // waived it, the cost is fully paid with no pitch.
    const result = planPayment(['generic'], noSources(), [], null, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.discounted).toBe(1)
    expect(result.plan.pitches).toEqual([])
  })
})

describe('applying a plan', () => {
  it('decrements exactly what the plan spent', () => {
    const prevOutputs = pips('attention', 'technology')
    const roundPool = pips('attention')
    const p = plan(['attention', 'attention'], { prevOutputs, roundPool })

    applyPlanToSources(p, prevOutputs, roundPool)

    expect(prevOutputs.attention).toBe(0)
    expect(prevOutputs.technology).toBe(1) // untouched
    expect(roundPool.attention).toBe(0)
  })
})

describe('looking through face-down cards', () => {
  const faceUp = (cardId: string) => ({
    cardId, faceDown: false, calls: null,
    outputsRemaining: pips('attention'), relayed: false, subverted: false,
  })
  const faceDown = (cardId: string) => ({
    cardId, faceDown: true, calls: { kind: 'rag' as const },
    outputsRemaining: zeroPips(), relayed: false, subverted: false,
  })

  it('funds the next card from the last FACE-UP card', () => {
    const slots = [faceUp(CARDS.cheap), faceDown(CARDS.cheap)]
    expect(lastPayingSlot(slots)?.faceDown).toBe(false)
  })

  it('has nothing to pay with in an empty context', () => {
    expect(lastPayingSlot([])).toBeUndefined()
    expect(totalPips(chainOutputs(undefined))).toBe(0)
  })
})
