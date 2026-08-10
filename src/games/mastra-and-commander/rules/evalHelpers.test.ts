/**
 * Eval scoring — the poker-hand matcher and the success ladder (design §4).
 */
import { describe, expect, it } from 'vitest'
import type { Color, Contribution, Shape } from '../constants'
import type { EvalCardDef } from '../cards/types'
import {
  contextSize, contributionsOf, isPass, matchEval, matchPattern, scoreTier,
} from './evalHelpers'
import { emptyGameState, placeCall, placeInContext } from '../testing/fixtures'

const c = (color: Color, shape: Shape): Contribution => ({ color, shape })

describe('matchPattern — countOfColor', () => {
  it('matches a named color reaching n', () => {
    const contribs = [c('cyan', 'circle'), c('cyan', 'square'), c('pink', 'circle')]
    expect(matchPattern(contribs, { kind: 'countOfColor', color: 'cyan', n: 2 })).toBe(true)
    expect(matchPattern(contribs, { kind: 'countOfColor', color: 'cyan', n: 3 })).toBe(false)
  })

  it('matches any single color when no color is named', () => {
    const contribs = [c('green', 'circle'), c('green', 'square')]
    expect(matchPattern(contribs, { kind: 'countOfColor', n: 2 })).toBe(true)
    // Two different colors do not add up.
    const mixed = [c('green', 'circle'), c('pink', 'square')]
    expect(matchPattern(mixed, { kind: 'countOfColor', n: 2 })).toBe(false)
  })
})

describe('matchPattern — noColor', () => {
  it('fails as soon as the banned color appears', () => {
    expect(matchPattern([c('cyan', 'circle')], { kind: 'noColor', color: 'pink' })).toBe(true)
    expect(matchPattern([c('pink', 'circle')], { kind: 'noColor', color: 'pink' })).toBe(false)
  })
})

describe('matchPattern — runOfShapes', () => {
  it('matches consecutive shapes in SHAPES order', () => {
    // circle → triangle → square are consecutive.
    const run = [c('cyan', 'circle'), c('pink', 'triangle'), c('green', 'square')]
    expect(matchPattern(run, { kind: 'runOfShapes', len: 3 })).toBe(true)
  })

  it('rejects a gap in the run', () => {
    // circle, square, hexagon — triangle and pentagon missing.
    const gapped = [c('cyan', 'circle'), c('cyan', 'square'), c('cyan', 'hexagon')]
    expect(matchPattern(gapped, { kind: 'runOfShapes', len: 3 })).toBe(false)
  })

  it('counts presence, not multiplicity', () => {
    const dupes = [c('cyan', 'circle'), c('pink', 'circle'), c('green', 'circle')]
    expect(matchPattern(dupes, { kind: 'runOfShapes', len: 2 })).toBe(false)
  })
})

describe('matchPattern — fullHouse', () => {
  it('needs three of one color and two of another', () => {
    const full = [
      c('cyan', 'circle'), c('cyan', 'square'), c('cyan', 'triangle'),
      c('pink', 'circle'), c('pink', 'square'),
    ]
    expect(matchPattern(full, { kind: 'fullHouse' })).toBe(true)
  })

  it('rejects three-plus-one', () => {
    const notFull = [
      c('cyan', 'circle'), c('cyan', 'square'), c('cyan', 'triangle'),
      c('pink', 'circle'),
    ]
    expect(matchPattern(notFull, { kind: 'fullHouse' })).toBe(false)
  })
})

describe('matchPattern — nOfAShape / countAny / shapeAtLeast', () => {
  it('nOfAShape counts shared shapes across colors', () => {
    const contribs = [c('cyan', 'circle'), c('pink', 'circle')]
    expect(matchPattern(contribs, { kind: 'nOfAShape', n: 2 })).toBe(true)
    expect(matchPattern(contribs, { kind: 'nOfAShape', n: 3 })).toBe(false)
  })

  it('countAny counts the total', () => {
    expect(matchPattern([c('cyan', 'circle')], { kind: 'countAny', n: 1 })).toBe(true)
    expect(matchPattern([], { kind: 'countAny', n: 1 })).toBe(false)
  })

  it('shapeAtLeast targets one shape', () => {
    const contribs = [c('cyan', 'hexagon'), c('pink', 'hexagon')]
    expect(matchPattern(contribs, { kind: 'shapeAtLeast', shape: 'hexagon', n: 2 })).toBe(true)
    expect(matchPattern(contribs, { kind: 'shapeAtLeast', shape: 'circle', n: 1 })).toBe(false)
  })
})

describe('matchEval', () => {
  const def: EvalCardDef = {
    id: 'X', name: 'X', par: 5, difficulty: 2, rulesText: '',
    patterns: [{ kind: 'countAny', n: 2 }, { kind: 'noColor', color: 'pink' }],
  }

  it('requires ALL patterns to hold', () => {
    expect(matchEval([c('cyan', 'circle'), c('green', 'square')], def)).toBe(true)
    // Enough contributions, but one is pink.
    expect(matchEval([c('cyan', 'circle'), c('pink', 'square')], def)).toBe(false)
    // No pink, but too few.
    expect(matchEval([c('cyan', 'circle')], def)).toBe(false)
  })
})

describe('contributionsOf', () => {
  it('collects contributions from every chain', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')       // cyan circle
    G.contexts.push({ slots: [], closed: false, ceiling: 7, parentChainIx: null, ownerCardId: null })
    placeInContext(G, 'TEST-OP-SCRATCHPAD', undefined, 1) // pink triangle

    const contribs = contributionsOf(G)
    expect(contribs).toHaveLength(2)
    expect(contextSize(G)).toBe(2)
  })

  it('skips subverted slots', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    G.contexts[0]!.slots[0]!.subverted = true
    expect(contributionsOf(G)).toHaveLength(0)
    // ...but the card still counts toward context size vs par.
    expect(contextSize(G)).toBe(1)
  })

  it('includes injected pollution', () => {
    const G = emptyGameState()
    G.injectedContributions = [c('pink', 'hexagon')]
    expect(contributionsOf(G)).toHaveLength(1)
  })

  it('does NOT score RAG until a face-down call invokes it', () => {
    const G = emptyGameState()
    G.rag.chaptersComplete = 4
    G.rag.contribution = [c('green', 'circle')]
    // Installed, but nothing in the Context reaches for it.
    expect(contributionsOf(G)).toHaveLength(0)

    placeCall(G, 'TEST-OP-SCRATCHPAD', { kind: 'rag' })
    expect(contributionsOf(G)).toEqual([c('green', 'circle')])
  })

  it('scores a called server as the installed Tool, not the face-down card', () => {
    const G = emptyGameState()
    G.servers = [{
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-TOOL-WEBSEARCH', // amber circle
      disabled: false,
    }]
    // The face-down card is a Durable Agent (green pentagon) — irrelevant.
    placeCall(G, 'TEST-OP-DURABLE-AGENT', { kind: 'server', index: 0 })
    expect(contributionsOf(G)).toEqual([c('amber', 'circle')])
  })

  it('scores a called Skill from its loadout attachment', () => {
    const G = emptyGameState()
    G.skillAttachments = [{
      equipmentId: 'TEST-EQ-LOCAL-RIG',
      skillCardId: 'TEST-OP-SKILL-SUMMARIZE', // amber triangle
    }]
    placeCall(G, 'TEST-OP-SCRATCHPAD', { kind: 'skill', equipmentId: 'TEST-EQ-LOCAL-RIG' })
    expect(contributionsOf(G)).toEqual([c('amber', 'triangle')])
  })

  it('scores a closed Process (it closes out with or without results)', () => {
    const G = emptyGameState()
    placeInContext(G, 'TEST-OP-AGENT')
    G.contexts[0]!.closed = true
    expect(contributionsOf(G)).toHaveLength(1)
  })
})

describe('scoreTier — the success ladder', () => {
  const def: EvalCardDef = {
    id: 'X', name: 'X', par: 4, superiorAt: 3, difficulty: 1, rulesText: '',
    patterns: [{ kind: 'countAny', n: 1 }],
  }
  const met = [c('cyan', 'circle')]

  it('superior at or under superiorAt', () => {
    expect(scoreTier(met, 3, def)).toBe('superior')
  })

  it('best between superiorAt and par', () => {
    expect(scoreTier(met, 4, def)).toBe('best')
  })

  it('lesser over par — passed sloppily', () => {
    expect(scoreTier(met, 5, def)).toBe('lesser')
  })

  it('failure when the pattern is unmet, regardless of size', () => {
    expect(scoreTier([], 1, def)).toBe('failure')
  })

  it('treats every tier but failure as a pass', () => {
    expect(isPass('superior')).toBe(true)
    expect(isPass('lesser')).toBe(true)
    expect(isPass('failure')).toBe(false)
  })

  it('has no superior band when the eval offers none', () => {
    const noSuperior: EvalCardDef = { ...def, superiorAt: undefined }
    expect(scoreTier(met, 1, noSuperior)).toBe('best')
  })
})
