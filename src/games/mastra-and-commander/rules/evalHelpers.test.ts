/**
 * Eval scoring: the pattern matcher, the success ladder, and the hand
 * comparison Algorithmic Intervention turns on.
 *
 * The matcher is tested against hand-built contribution lists — it is pure
 * combinatorics over colour and shape, and pinning it to whatever the current
 * cards happen to contribute would make a card tweak break unrelated tests.
 * Real cards appear where card lookup is the point: what a Context slot scores.
 */
import { describe, expect, it } from 'vitest'
import {
  contextSize, contributionsOf, handDifference, isPass, matchEval, matchPattern,
  nearestEval, scoreTier, slotContributions,
} from './evalHelpers'
import type { EvalCardDef } from '../cards/types'
import type { Color, Contribution, Shape } from '../constants'
import {
  addContext, addThreat, emptyGameState, installServerDirect, placeCall,
  placeInContext, CARDS,
} from '../testing/fixtures'
import { getEvalCard, getOperatorCard } from '../cards/registry'

const c = (color: Color, shape: Shape): Contribution => ({ color, shape })

const evalOf = (patterns: EvalCardDef['patterns'], extra: Partial<EvalCardDef> = {}) => ({
  id: 'X', name: 'X', hand: [], par: 5, difficulty: 2 as const, rulesText: '',
  patterns, ...extra,
})

describe('pattern matching', () => {
  it('countOfColor counts a named colour', () => {
    const contribs = [c('cyan', 'circle'), c('cyan', 'square'), c('amber', 'circle')]
    expect(matchPattern(contribs, { kind: 'countOfColor', color: 'cyan', n: 2 })).toBe(true)
    expect(matchPattern(contribs, { kind: 'countOfColor', color: 'cyan', n: 3 })).toBe(false)
  })

  it('countOfColor with no colour named accepts any single colour reaching n', () => {
    const contribs = [c('violet', 'circle'), c('violet', 'square')]
    expect(matchPattern(contribs, { kind: 'countOfColor', n: 2 })).toBe(true)
  })

  it('noColor bans a colour outright', () => {
    expect(matchPattern([c('cyan', 'circle')], { kind: 'noColor', color: 'pink' })).toBe(true)
    expect(matchPattern([c('pink', 'circle')], { kind: 'noColor', color: 'pink' })).toBe(false)
  })

  it('runOfShapes wants consecutive shapes, counting presence not multiplicity', () => {
    const run = [c('cyan', 'circle'), c('amber', 'triangle'), c('pink', 'square')]
    expect(matchPattern(run, { kind: 'runOfShapes', len: 3 })).toBe(true)
    const gap = [c('cyan', 'circle'), c('cyan', 'circle'), c('amber', 'square')]
    expect(matchPattern(gap, { kind: 'runOfShapes', len: 3 })).toBe(false)
  })

  it('fullHouse wants three of one colour and two of another', () => {
    const house = [
      c('cyan', 'circle'), c('cyan', 'square'), c('cyan', 'triangle'),
      c('amber', 'circle'), c('amber', 'square'),
    ]
    expect(matchPattern(house, { kind: 'fullHouse' })).toBe(true)
    expect(matchPattern(house.slice(0, 4), { kind: 'fullHouse' })).toBe(false)
  })

  it('nOfAShape counts a repeated shape across colours', () => {
    const contribs = [c('cyan', 'circle'), c('amber', 'circle')]
    expect(matchPattern(contribs, { kind: 'nOfAShape', n: 2 })).toBe(true)
  })

  it('an eval passes only when EVERY pattern holds', () => {
    const def = evalOf([
      { kind: 'countAny', n: 2 },
      { kind: 'noColor', color: 'pink' },
    ])
    expect(matchEval([c('cyan', 'circle'), c('amber', 'circle')], def)).toBe(true)
    expect(matchEval([c('cyan', 'circle'), c('pink', 'circle')], def)).toBe(false)
  })
})

describe('the success ladder', () => {
  const def = evalOf([{ kind: 'countAny', n: 1 }], { par: 4, superiorAt: 3 })
  const met = [c('cyan', 'circle')]

  it('fails when the pattern is not met, however small the context', () => {
    expect(scoreTier([], 1, def)).toBe('failure')
  })

  it('is superior within superiorAt', () => {
    expect(scoreTier(met, 3, def)).toBe('superior')
  })

  it('is best within par', () => {
    expect(scoreTier(met, 4, def)).toBe('best')
  })

  it('is lesser over par — a sloppy pass, still a pass', () => {
    expect(scoreTier(met, 5, def)).toBe('lesser')
    expect(isPass('lesser')).toBe(true)
    expect(isPass('failure')).toBe(false)
  })
})

describe('what a Context slot contributes', () => {
  it('scores a face-up card by its own printed Contribution', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    expect(slotContributions(G, G.contexts[0]!.slots[0]!))
      .toEqual(getOperatorCard(CARDS.cheap).contributes)
  })

  it('scores a subverted card as nothing', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    G.contexts[0]!.slots[0]!.subverted = true
    expect(slotContributions(G, G.contexts[0]!.slots[0]!)).toEqual([])
  })

  it('scores a called server as the installed card, not the face-down one', () => {
    const G = emptyGameState()
    const server = installServerDirect(G)
    placeCall(G, CARDS.response, { kind: 'server', serverId: server.id })
    expect(slotContributions(G, G.contexts[0]!.slots[0]!))
      .toEqual(getOperatorCard(server.traitCardId).contributes)
  })

  it('scores a called Skill from its loadout attachment', () => {
    const G = emptyGameState()
    G.skillAttachments = [{ loadoutId: CARDS.loadout, skillCardId: CARDS.attachable }]
    placeCall(G, CARDS.response, { kind: 'skill', loadoutId: CARDS.loadout })
    expect(slotContributions(G, G.contexts[0]!.slots[0]!))
      .toEqual(getOperatorCard(CARDS.attachable).contributes)
  })

  it('scores nothing for a live Ongoing threat that blanks its class', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap) // produces attention
    addThreat(G, CARDS.threatBlank)
    expect(slotContributions(G, G.contexts[0]!.slots[0]!)).toEqual([])
  })
})

describe('gathering the whole board', () => {
  it('collects from every context, nested ones included', () => {
    const G = emptyGameState()
    const child = addContext(G, 0)
    placeInContext(G, CARDS.cheap, undefined, 0)
    placeInContext(G, CARDS.cheap, undefined, child)
    expect(contributionsOf(G)).toHaveLength(2)
    expect(contextSize(G)).toBe(2)
  })

  it('scores a closed context — it closes out with or without results', () => {
    const G = emptyGameState()
    placeInContext(G, CARDS.cheap)
    G.contexts[0]!.closed = true
    expect(contributionsOf(G)).toHaveLength(1)
  })

  it('includes injected junk', () => {
    const G = emptyGameState()
    G.injectedContributions = [c('pink', 'hexagon')]
    expect(contributionsOf(G)).toEqual([c('pink', 'hexagon')])
  })
})

describe('comparing objectives (Algorithmic Intervention)', () => {
  it('rates identical hands as no difference', () => {
    const hand = getEvalCard(CARDS.evalEasy).hand
    expect(handDifference(hand, [...hand])).toBe(0)
  })

  it('counts a swapped mark as two — one gone, one arrived', () => {
    expect(handDifference(['cyan/*', 'amber/*'], ['cyan/*', 'violet/*'])).toBe(2)
  })

  it('counts a length gap even when everything else matches', () => {
    expect(handDifference(['cyan/*'], ['cyan/*', 'cyan/*'])).toBe(1)
  })

  it('finds no neighbour when nothing is within the threshold', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    G.evalDeck = [CARDS.evalHard]
    // The two shipped objectives differ by five marks.
    expect(handDifference(
      getEvalCard(CARDS.evalEasy).hand,
      getEvalCard(CARDS.evalHard).hand,
    )).toBe(5)
    expect(nearestEval(G, 2)).toBeNull()
  })

  it('finds the neighbour once the threshold reaches it', () => {
    const G = emptyGameState()
    G.currentEvalId = CARDS.evalEasy
    G.evalDeck = [CARDS.evalHard]
    expect(nearestEval(G, 5)).toBe(CARDS.evalHard)
  })
})
