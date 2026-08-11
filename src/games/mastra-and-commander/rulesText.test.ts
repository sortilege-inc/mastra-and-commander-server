/**
 * The rules-text mini-syntax parser.
 *
 * Tested through the segmenting regex rather than by rendering, so these stay
 * fast, DOM-free unit tests. The component maps segments to <strong>/<span>
 * one-to-one, so the segmentation IS the logic.
 */
import { describe, expect, it } from 'vitest'
import { ALL_CARD_IDS, getEntropyCard, getEvalCard, getFeatureCard, getOperatorCard }
  from './cards/registry'

/** Mirrors the SEGMENT regex in RulesText.tsx. */
const SEGMENT = /(\*\*[^*]+\*\*|\{[a-z]+\})/g
const segment = (text: string): string[] => text.split(SEGMENT).filter((p) => p !== '')

describe('rules-text segmentation', () => {
  it('splits bold runs out of surrounding prose', () => {
    expect(segment('**Response:** remove up to 2 injected contributions.'))
      .toEqual(['**Response:**', ' remove up to 2 injected contributions.'])
  })

  it('handles several bold runs in one string', () => {
    expect(segment('Grants **attention** and a **generic** each round.'))
      .toEqual(['Grants ', '**attention**', ' and a ', '**generic**', ' each round.'])
  })

  it('splits legacy icon tokens', () => {
    expect(segment('Gain {gear} this round.'))
      .toEqual(['Gain ', '{gear}', ' this round.'])
  })

  it('leaves plain text as a single segment', () => {
    expect(segment('The basic unit of work.')).toEqual(['The basic unit of work.'])
  })

  it('does not treat an unmatched asterisk pair as bold', () => {
    expect(segment('2 * 3 is not bold')).toEqual(['2 * 3 is not bold'])
  })
})

describe('card data uses the printed mini-syntax', () => {
  /** Every rules string in the set, with its card id for a useful failure. */
  const allRulesText = (): Array<[string, string]> => {
    const out: Array<[string, string]> = []
    for (const id of ALL_CARD_IDS()) {
      for (const get of [getOperatorCard, getEntropyCard, getEvalCard, getFeatureCard]) {
        let def: { rulesText?: string } | undefined
        try { def = get(id) as { rulesText?: string } } catch { continue }
        if (def?.rulesText) out.push([id, def.rulesText])
        break
      }
    }
    return out
  }

  it('has no unexpanded icon tokens — resources are spelled out and bolded', () => {
    const offenders = allRulesText()
      .filter(([, text]) => /\{(coin|eye|gear|blank)\}/.test(text))
      .map(([id]) => id)
    expect(offenders).toEqual([])
  })

  it('closes every bold run it opens', () => {
    const unbalanced = allRulesText()
      .filter(([, text]) => (text.match(/\*\*/g) ?? []).length % 2 !== 0)
      .map(([id]) => id)
    expect(unbalanced).toEqual([])
  })
})
