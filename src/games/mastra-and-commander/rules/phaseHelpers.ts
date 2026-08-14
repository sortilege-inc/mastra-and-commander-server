/**
 * Phase entry/exit orchestration and the round rollover.
 *
 * The round loop is design §2 (locked):
 *   1 Reveal → 2 Play → 3 Entropy → 4 Response → 5 Eval check → (rollover) → 1
 *
 * The reveal engine and the rollover are where most of the BEST-GUESS economy
 * decisions live; each is tagged with the open question it resolves.
 */
import {
  DEFAULT_CONTEXT_CEILING, DEFAULT_PROCESS_LIMIT, FEATURE_OFFER_SIZE,
  FEATURE_PICKS_BY_DIFFICULTY, LESSER_ENTROPY_PENALTY, MATCH_ROUNDS,
  MATCH_WIN_PASSES, SERVER_GRANT,
} from '../constants'
import type { Pip } from '../constants'
import type { EvalTier, MCState } from '../types'
import { getLoadout, getEvalCard, getModel, getOperatorCard } from '../cards/registry'
import { contextSize, contributionsOf, isPass, scoreTier } from './evalHelpers'
import { feedEntropy, log, refillHand } from './playHelpers'
import { zeroPips } from './ioFlow'

/** Add pips to the round pool. */
function grant(G: MCState, pips: Pip[], reason: string): void {
  if (pips.length === 0) return
  for (const pip of pips) G.roundPool[pip] += 1
  log(G, `gained ${pips.join(' ')} from ${reason}`)
}

/**
 * Phase 1 — Reveal.
 *
 * Reveals the objective, then runs the Operator's free economy for the round:
 * loadout auto-pitch, model grant, server grants, and the Feature offer.
 */
export function enterReveal(G: MCState): void {
  G.phase = 'reveal'

  // 1. Reveal an Objective from the Eval deck (locked).
  const next = G.evalDeck.shift()
  if (next === undefined) {
    log(G, 'Eval deck exhausted — the match ends here.')
    endMatch(G, 'rounds')
    return
  }
  G.currentEvalId = next
  const evalDef = getEvalCard(next)
  log(G, `objective revealed: ${evalDef.name} (par ${evalDef.par}, difficulty ${evalDef.difficulty})`)

  // The Objective may tighten (or loosen) the context ceiling.
  const ceiling = evalDef.contextCeiling ?? DEFAULT_CONTEXT_CEILING
  for (const chain of G.contexts) chain.ceiling = ceiling
  if (ceiling !== DEFAULT_CONTEXT_CEILING) {
    log(G, `context ceiling for this eval: ${ceiling}`)
  }

  // 2. Loadout auto-pitch (design §4: loadout "auto-pitches cards off the
  //    top of your deck ... and grants free resources of its types").
  //    BEST-GUESS(Q12): one card milled per loadout, no draw, and — unlike a
  //    hand pitch — no Entropy feed. This is the free baseline economy; taxing
  //    it would make the loadout a liability rather than a floor.
  for (const equipId of G.loadout) {
    const equip = getLoadout(equipId)
    const milled = G.operatorDeck.shift()
    if (milled !== undefined) {
      G.operatorDiscard.push(milled)
    }
    grant(G, equip.grants, equip.name)
  }

  // 3. Model grant (BEST-GUESS(Q11): models are free-resource engines).
  grant(G, getModel(G.installedModelId).grants, getModel(G.installedModelId).name)

  // 4. Server grants (BEST-GUESS(Q10): the payoff for taking on attack surface).
  for (const server of G.servers) {
    if (server.disabled) continue
    grant(G, SERVER_GRANT, `server (${getOperatorCard(server.traitCardId).name})`)
  }

  // 5. Feature offer — the eval's difficulty sets how many may be picked
  //    (locked: "generally 1–3"). BEST-GUESS: offer FEATURE_OFFER_SIZE to
  //    choose among.
  G.featureOffer = G.featuresDeck.splice(0, FEATURE_OFFER_SIZE)
  const picks = FEATURE_PICKS_BY_DIFFICULTY[evalDef.difficulty]
  if (G.featureOffer.length > 0 && picks > 0) {
    G.pendingFeaturePicks = { remaining: Math.min(picks, G.featureOffer.length) }
    log(G, `select ${G.pendingFeaturePicks.remaining} feature(s)`)
  }
}

/** Phase 2 — Play. Nothing to set up; the Operator acts. */
export function enterPlay(G: MCState): void {
  G.phase = 'play'
}

/** Phase 3 — Entropy. The stack is resolved by moves, in reverse order. */
export function enterEntropy(G: MCState): void {
  G.phase = 'entropy'
  log(G, `${G.entropyStack.length} Entropy to resolve (LIFO)`)
}

/** Phase 4 — Response. */
export function enterResponse(G: MCState): void {
  G.phase = 'response'
}

/**
 * Phase 5 — Eval check. Scoring happens on ENTRY, so the Operator sees the
 * verdict and can then choose relays / scraps before the round closes.
 */
export function enterEvalCheck(G: MCState): void {
  G.phase = 'evalCheck'
  if (!G.currentEvalId) return

  const evalDef = getEvalCard(G.currentEvalId)
  const contribs = contributionsOf(G)
  const size = contextSize(G)
  const tier = scoreTier(contribs, size, evalDef)

  G.roundResults.push({
    round: G.round,
    evalId: evalDef.id,
    tier,
    contextSize: size,
  })

  log(G, `eval ${evalDef.name}: ${tier.toUpperCase()} (${contribs.length} contributions, context ${size}, par ${evalDef.par})`)

  if (tier === 'superior') {
    // BEST-GUESS: the design awards a Reward card that "functions like a Setup
    // card". There is no reward deck yet, so this is logged, not granted —
    // honest stub rather than an invented card.
    log(G, 'SUPERIOR — a Reward card would be earned here (reward deck not yet designed).')
  }

  if (tier === 'failure') {
    // Design §4: on failure Entropy persists; you may scrap your own engine to
    // shed it (Durable −3, Setup −5).
    G.pendingFailureScrap = { removableCount: G.entropyResolved.length }
  }
}

/** Cards eligible to be scrapped to shed Entropy on a failed eval. */
export function scrappableCards(G: MCState): Array<{ cardId: string; removes: number }> {
  const out: Array<{ cardId: string; removes: number }> = []
  for (const chain of G.contexts) {
    for (const slot of chain.slots) {
      const def = getOperatorCard(slot.cardId)
      const keywords = def.keywords ?? []
      if (keywords.includes('setup')) out.push({ cardId: slot.cardId, removes: 5 })
      else if (keywords.includes('durable')) out.push({ cardId: slot.cardId, removes: 3 })
    }
  }
  for (const server of G.servers) {
    out.push({ cardId: server.traitCardId, removes: 5 })
  }
  return out
}

/**
 * Decide the match winner. Two ways to get here (owner ruling, 2026-08-10):
 * the three evals run out, or the Operator cycles through their deck.
 */
export function endMatch(G: MCState, reason: 'rounds' | 'deckOut'): void {
  const passes = G.roundResults.filter((r) => isPass(r.tier)).length
  G.matchWinner = passes >= MATCH_WIN_PASSES ? 'operator' : 'entropy'
  G.matchEndReason = reason
  log(G, reason === 'deckOut'
    ? `deck exhausted — match over. Operator passed ${passes}/${G.roundResults.length}; winner: ${G.matchWinner}`
    : `match over — Operator passed ${passes}/${G.roundResults.length}; winner: ${G.matchWinner}`)
}

/**
 * The Operator has cycled their deck — one of the two end conditions.
 * Checked after any refill, since the refill is what drains it.
 */
export function checkDeckOut(G: MCState): boolean {
  if (G.matchWinner) return true
  if (G.operatorDeck.length > 0) return false
  endMatch(G, 'deckOut')
  return true
}

/**
 * Close the round and open the next one.
 *
 * Order matters here — Entropy persistence is decided before the Context is
 * torn down, because relays feed Entropy into the round that is starting.
 */
export function roundRollover(G: MCState): void {
  const result = G.roundResults[G.roundResults.length - 1]
  const tier: EvalTier = result?.tier ?? 'failure'

  // 1. Entropy persistence (design §4 ladder).
  if (tier === 'failure') {
    // "Entropy persists into next round" — the resolved cards go back on the
    // stack to be resolved again (BEST-GUESS: the literal reading).
    G.entropyStack.push(...G.entropyResolved)
    log(G, `${G.entropyResolved.length} Entropy persists into the next round`)
  } else {
    G.entropyDiscard.push(...G.entropyResolved)
  }
  G.entropyResolved = []

  // 2. A "lesser" pass adds to next round's Entropy (locked; amount BEST-GUESS).
  if (tier === 'lesser') {
    feedEntropy(G, LESSER_ENTROPY_PENALTY, 'sloppy pass')
  }

  // 3. Context teardown. Stateless by default: the window closes and cards
  //    discard. Relay carries a card forward, feeding Entropy unless Durable.
  //    Installed servers, attached Skills, and RAG are NOT torn down — they
  //    persist for the whole match, which is what you bought with the extra
  //    Entropy at install time.
  const survivors: string[] = []
  for (const chain of G.contexts) {
    for (const slot of chain.slots) {
      // A face-down CALL is spent when the window closes; the resource it
      // called stays installed.
      if (slot.faceDown) {
        G.operatorDiscard.push(slot.cardId)
        continue
      }
      const def = getOperatorCard(slot.cardId)
      const durable = (def.keywords ?? []).includes('durable')
      if (slot.relayed) {
        survivors.push(slot.cardId)
        if (!durable) {
          // BEST-GUESS(Q4): a non-durable relay costs Entropy only — no
          // resource cost. The doc asks whether relaying also costs resources;
          // entropy-only is the simpler reading and keeps the relay decision
          // about risk rather than tempo.
          feedEntropy(G, 1, `relayed ${def.name}`)
        }
      } else {
        G.operatorDiscard.push(slot.cardId)
      }
    }
  }

  const ceiling = nextCeiling(G)
  G.contexts = [{
    slots: survivors.map((cardId) => ({
      cardId,
      faceDown: false,
      calls: null,
      outputsRemaining: zeroPips(),
      relayed: false,
      subverted: false,
    })),
    closed: false,
    ceiling,
    parentChainIx: null,
    ownerCardId: null,
  }]
  G.processLimit = DEFAULT_PROCESS_LIMIT
  G.frameworkFreeAgentUsed = false

  // 4. Round-scoped state clears.
  G.injectedContributions = []
  G.roundPool = zeroPips()
  G.entropyFedThisRound = 0
  G.ignoreNextFeed = false

  // 5. Features refresh — BEST-GUESS(Q18): chosen fresh each eval, so both the
  //    picks and the unpicked offer return to the bottom of the deck.
  G.featuresDeck.push(...G.activeFeatureIds, ...G.featureOffer)
  G.activeFeatureIds = []
  G.featureOffer = []

  // 6. Top the hand back up, then advance or end the match.
  refillHand(G, 'new round')
  if (G.round >= MATCH_ROUNDS) {
    endMatch(G, 'rounds')
    return
  }
  if (checkDeckOut(G)) return
  G.round += 1
  enterReveal(G)
}

/** The context ceiling the next round should use — the current objective's, or
 *  the default when there isn't one. */
function nextCeiling(G: MCState): number {
  const next = G.evalDeck[0]
  if (!next) return DEFAULT_CONTEXT_CEILING
  try {
    return getEvalCard(next).contextCeiling ?? DEFAULT_CONTEXT_CEILING
  } catch {
    // Redacted (HIDDEN) eval ids reach here on the client's optimistic copy.
    return DEFAULT_CONTEXT_CEILING
  }
}
