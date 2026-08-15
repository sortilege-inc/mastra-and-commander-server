/**
 * Play-phase moves (design §2 step 2): the Operator builds the Context.
 *
 * The placement rules (owner rulings, 2026-08-10) are the heart of this file:
 *
 * What a card can DO comes from what it PRINTS, never from its subhead: a card
 * printing `MCP:` can be installed as a server, one printing `Attach:` can ride
 * a loadout, and Events/Responses are identified by having those payloads. The
 * subhead is flavour.
 *
 *  - A card printing `MCP:` can be INSTALLED as a server (it plus a second card
 *    face-down as the substrate, 2 Entropy — one per card) where it gains
 *    Durable and persists for the whole match; or played INLINE into the
 *    Context for 1 Entropy, where it does not.
 *  - A card printing `Attach:` can be ATTACHED to a loadout item, gaining
 *    Durable; or played INLINE, where it does not.
 *  - Installed Tools, attached Skills, and a completed RAG track do NOT score
 *    on their own. You reach them by playing a card FACE-DOWN into the Context
 *    as a **CALL** — free, because the Entropy was paid at install time. The
 *    called resource's Contribution is what lands in the Context.
 *  - Face-down cards are SKIPPED for produce/consume: the chain looks through
 *    them to the last face-up card.
 *  - Contexts are opened by Agent tokens, not by played cards (see
 *    contextRows.ts). The framework makes the round's first Agent free.
 *
 * All moves here are Operator-only and guard on phase + open gates.
 */
import { INVALID_MOVE } from 'boardgame.io/core'
import {
  CALL_ENTROPY, CLAW_COMPLETE_COUNT, DEFAULT_CONTEXT_CEILING, OPERATOR_SEAT,
  RAG_CHAPTERS, RAG_CLEAR_COUNT, RAG_RERANK_INDEX, RAG_UPSERT_INDEX,
  SKILL_ATTACH_ENTROPY, TOOL_SERVER_ENTROPY,
} from '../constants'
import type { MCState, CallTarget } from '../types'
import { getFramework, getOperatorCard } from '../cards/registry'
import { extraFeedFor } from './entropyHelpers'
import { asPitchable } from '../cards/registry'
import { MODEL_CARDS } from '../cards/cardSet'
import { contributionSize } from '../cards/types'
import {
  applyPlanToSources, chainOutputs, lastPayingSlot, planPayment, toPipCounts,
  zeroPips,
} from './ioFlow'
import {
  draw, ecosystemDiscount, executePitches, feedCostOf, feedEntropy, log,
  refillHand, removeFromHands,
} from './playHelpers'

/** The subset of the boardgame.io move context these handlers use. */
export interface MoveCtx {
  G: MCState
  playerID?: string | null
  random?: { Die: (spotvalue: number) => number; Shuffle: <T>(deck: T[]) => T[] }
}

/** Shared guard: Operator seat, play phase, no gate blocking. */
function canOperatorAct(G: MCState, playerID?: string | null): boolean {
  if (playerID != null && playerID !== OPERATOR_SEAT) return false
  if (G.matchWinner) return false
  return G.pendingFeaturePicks === null
    && G.pendingEntropyTarget === null
    && G.pendingFailureScrap === null
}

/** True while the Operator may add a card to this chain. */
function chainHasRoom(G: MCState, chainIx: number): boolean {
  const chain = G.contexts[chainIx]
  if (!chain || chain.closed) return false
  return chain.slots.length < chain.ceiling
}

/** Look up pitch cards, rejecting any not actually held. */
function resolvePitches(G: MCState, pitchIds: string[]) {
  const defs = []
  for (const id of pitchIds) {
    if (!G.operatorHand.includes(id) && !G.clawHand.includes(id)) return null
    // Any card may be pitched, including an upgrade drawn off the operator
    // deck — see asPitchable.
    defs.push(asPitchable(id))
  }
  return defs
}

const inHand = (G: MCState, cardId: string): boolean =>
  G.operatorHand.includes(cardId) || G.clawHand.includes(cardId)

/**
 * Play a card into a Context chain (design §4 "Context — the window & the I/O
 * flow"). Cost is paid from the previous face-up card's outputs, then the round
 * pool, then by pitching.
 */
export function playToContext(
  { G, playerID }: MoveCtx,
  processIx: number,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!chainHasRoom(G, processIx)) return INVALID_MOVE
  if (!inHand(G, cardId)) return INVALID_MOVE

  const chain = G.contexts[processIx]!
  const def = getOperatorCard(cardId)
  // Events and Responses have their own moves/phases.
  if (def.event) return INVALID_MOVE // Events have their own move

  // Framework: the first Agent each round is free — no cost, no Entropy.
  const framework = getFramework(G.frameworkId)
  const free = !G.frameworkFreeAgentUsed
    && def.traits.includes(framework.freeTrait)

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  // Face-down calls are skipped for produce/consume — look through them.
  const payingSlot = lastPayingSlot(chain.slots)

  if (free) {
    if (pitchIds.length > 0) return INVALID_MOVE // nothing to pay for
  } else {
    const result = planPayment(
      def.consume,
      {
        prevOutputs: chainOutputs(payingSlot?.outputsRemaining),
        roundPool: G.roundPool,
      },
      pitchDefs,
      def,
      ecosystemDiscount(G, def),
    )
    if (!result.ok) return INVALID_MOVE

    applyPlanToSources(result.plan, payingSlot?.outputsRemaining ?? null, G.roundPool)
    executePitches(G, result.plan.pitches, `playing ${def.name}`)
  }

  removeFromHands(G, cardId)
  chain.slots.push({
    cardId,
    faceDown: false,
    calls: null,
    outputsRemaining: toPipCounts(def.produce),
    relayed: false,
    subverted: false,
  })

  if (free) {
    G.frameworkFreeAgentUsed = true
    log(G, `played ${def.name} — free via ${framework.name}`)
  } else {
    log(G, `played ${def.name} into the Context`)
    feedEntropy(G, feedCostOf(def), `played ${def.name}`)
    // A live Ongoing threat may tax this card entering the context (Model
    // Collapse: "an additional entropy whenever a card that produces
    // automation enters the context").
    const extra = extraFeedFor(G, cardId)
    if (extra > 0) feedEntropy(G, extra, 'Model Collapse')
  }


  refillHand(G, `played ${def.name}`)
}

/**
 * Play a card FACE-DOWN into the Context to CALL an installed resource — an
 * MCP server's Tool, a Skill on your rig/cloud, or a completed RAG track.
 *
 * Free of Entropy and of resources: you already paid when you installed it.
 * The called resource's Contribution is what the Context scores.
 */
export function callInstalled(
  { G, playerID }: MoveCtx,
  processIx: number,
  cardId: string,
  target: CallTarget,
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!chainHasRoom(G, processIx)) return INVALID_MOVE
  if (!inHand(G, cardId)) return INVALID_MOVE
  if (!callTargetExists(G, target)) return INVALID_MOVE

  removeFromHands(G, cardId)
  G.contexts[processIx]!.slots.push({
    cardId,
    faceDown: true,
    calls: target,
    // Face-down cards are skipped for produce/consume.
    outputsRemaining: zeroPips(),
    relayed: false,
    subverted: false,
  })
  log(G, `called ${describeCallTarget(G, target)} (face-down)`)
  feedEntropy(G, CALL_ENTROPY, 'call')

  // A call does BOTH (owner ruling, 2026-08-13): the Contribution lands in the
  // Context (above) AND the called card's printed `Call:` text resolves. That
  // is what makes paying the install Entropy worth it over playing inline.
  applyCallEffect(G, target)

  refillHand(G, 'call')
}

/** Resolve the printed `Call:` ability of whatever this target names. */
function applyCallEffect(G: MCState, target: CallTarget): void {
  const sourceId = calledCardId(G, target)
  if (!sourceId) return
  const def = getOperatorCard(sourceId)
  if (!def.call) return

  switch (def.call.kind) {
    case 'drawThenDiscard': {
      draw(G, def.call.draw, `${def.name} call`)
      // Discard from the top of the hand — nothing in the text lets the player
      // choose, and a gate for one card would stall the turn.
      for (let i = 0; i < def.call.discard; i++) {
        const discarded = G.operatorHand.shift()
        if (discarded === undefined) break
        G.operatorDiscard.push(discarded)
        log(G, `${def.name} call: discarded ${getOperatorCard(discarded).name}`)
      }
      break
    }
    case 'gainPips':
      for (const pip of def.call.pips) G.roundPool[pip] += 1
      log(G, `${def.name} call: gained ${def.call.pips.join(' ')}`)
      break
  }
}

/** The card whose printed text a call resolves, or null for RAG (no card). */
function calledCardId(G: MCState, target: CallTarget): string | null {
  switch (target.kind) {
    case 'server':
      return findServer(G, target.serverId)?.traitCardId ?? null
    case 'skill':
      return G.skillAttachments.find((a) => a.loadoutId === target.loadoutId)
        ?.skillCardId ?? null
    case 'rag':
      // RAG's payload is a Contribution, not a card with printed text.
      return null
  }
}

/** Is this call target actually installed and usable? */
export function callTargetExists(G: MCState, target: CallTarget): boolean {
  switch (target.kind) {
    case 'server': {
      const server = findServer(G, target.serverId)
      return !!server && !server.disabled
    }
    case 'skill':
      return G.skillAttachments.some((a) => a.loadoutId === target.loadoutId)
    case 'rag':
      return G.rag.chaptersComplete > RAG_UPSERT_INDEX
  }
}

/** Look up an installed server by its stable id. */
export function findServer(G: MCState, serverId: string) {
  return G.servers.find((server) => server.id === serverId)
}

export function describeCallTarget(G: MCState, target: CallTarget): string {
  switch (target.kind) {
    case 'server': {
      // Total by design: Entropy can destroy a server out from under a call
      // that is already face-down in the Context, and the board still has to
      // render that slot.
      const server = findServer(G, target.serverId)
      return server ? getOperatorCard(server.traitCardId).name : 'a destroyed server'
    }
    case 'skill': {
      const attachment = G.skillAttachments.find((a) => a.loadoutId === target.loadoutId)
      return attachment ? getOperatorCard(attachment.skillCardId).name : 'a Skill'
    }
    case 'rag':
      return 'RAG'
  }
}

/** Play an Event-trait card — pays like a Context card but resolves an effect
 *  and goes to the discard instead of joining a chain. */
export function playEvent(
  { G, playerID }: MoveCtx,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!inHand(G, cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  if (!def.event) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  // Events are not part of a chain, so there are no previous outputs.
  const result = planPayment(
    def.consume,
    { prevOutputs: zeroPips(), roundPool: G.roundPool },
    pitchDefs,
    def,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `playing ${def.name}`)
  removeFromHands(G, cardId)
  G.operatorDiscard.push(cardId)
  log(G, `played ${def.name}`)

  switch (def.event.kind) {
    case 'gainPips':
      for (const pip of def.event.pips) G.roundPool[pip] += 1
      log(G, `gained ${def.event.pips.join(' ')}`)
      break
    case 'draw':
      draw(G, def.event.n, def.name)
      break
    case 'openProcess':
      G.processLimit += 1
      log(G, `Process limit is now ${G.processLimit}`)
      break
  }

  feedEntropy(G, feedCostOf(def), `played ${def.name}`)
  refillHand(G, `played ${def.name}`)
}

/**
 * Install a Tool as an MCP server: the Tool plus a second card discarded
 * face-down as the substrate. Costs TOOL_SERVER_ENTROPY (one per card), gains
 * Durable, and persists for the whole match.
 */
export function installServer(
  { G, playerID }: MoveCtx,
  substrateCardId: string,
  traitCardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (substrateCardId === traitCardId) return INVALID_MOVE
  if (!inHand(G, substrateCardId) || !inHand(G, traitCardId)) return INVALID_MOVE

  const traitDef = getOperatorCard(traitCardId)
  // It prints `MCP:` — that, not a subhead, is what makes it installable.
  if (!traitDef.mcp) {
    return INVALID_MOVE
  }

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    traitDef.consume,
    { prevOutputs: zeroPips(), roundPool: G.roundPool },
    pitchDefs,
    traitDef,
    ecosystemDiscount(G, traitDef),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `installing ${traitDef.name}`)

  removeFromHands(G, substrateCardId)
  removeFromHands(G, traitCardId)
  G.servers.push({
    id: `srv-${G.nextServerSeq}`,
    substrateCardId,
    traitCardId,
    disabled: false,
  })
  G.nextServerSeq += 1
  log(G, `installed ${traitDef.name} as an MCP server (Durable, persists)`)
  feedEntropy(G, TOOL_SERVER_ENTROPY, `installed ${traitDef.name}`)
  refillHand(G, `installed ${traitDef.name}`)
}

/**
 * Attach a Skill to a loadout item (local rig or cloud). The Skill gains
 * Durable and persists; call it later with a face-down card.
 */
export function attachSkill(
  { G, playerID }: MoveCtx,
  loadoutId: string,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!inHand(G, cardId)) return INVALID_MOVE
  if (!G.loadout.includes(loadoutId)) return INVALID_MOVE
  // One Skill per loadout item.
  if (G.skillAttachments.some((a) => a.loadoutId === loadoutId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  // It prints `Attach:`.
  if (!def.attach) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    def.consume,
    { prevOutputs: zeroPips(), roundPool: G.roundPool },
    pitchDefs,
    def,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `attaching ${def.name}`)
  removeFromHands(G, cardId)
  G.skillAttachments.push({ loadoutId, skillCardId: cardId })
  log(G, `attached ${def.name} to ${loadoutId} (Durable, persists)`)
  feedEntropy(G, SKILL_ATTACH_ENTROPY, `attached ${def.name}`)
  refillHand(G, `attached ${def.name}`)
}

/**
 * Advance the RAG saga by one chapter (owner ruling, 2026-08-10).
 *
 * Each chapter costs one pip of its own type (RAG_CHAPTERS). The card fed to
 * the Upsert chapter sets RAG's payload — the Contribution a CALL to RAG
 * supplies. Completing the required chapters clears Entropy at random.
 *
 * `cardId` is required at Upsert (it becomes the payload) and at Rerank (its
 * contribution replaces the payload, and must be the same size); ignored
 * elsewhere.
 */
export function advanceRag(
  { G, playerID, random }: MoveCtx,
  pitchIds: string[] = [],
  cardId: string | null = null,
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE

  const chapterIx = G.rag.chaptersComplete
  const chapter = RAG_CHAPTERS[chapterIx]
  if (!chapter) return INVALID_MOVE // saga already complete

  const needsCard = chapterIx === RAG_UPSERT_INDEX || chapterIx === RAG_RERANK_INDEX
  if (needsCard) {
    if (!cardId || !inHand(G, cardId)) return INVALID_MOVE
  }

  // Rerank may only swap in a payload of EQUAL size (icon count).
  if (chapterIx === RAG_RERANK_INDEX && cardId) {
    const replacement = getOperatorCard(cardId).contributes
    if (contributionSize(replacement) !== contributionSize(G.rag.contribution)) {
      return INVALID_MOVE
    }
  }

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    [chapter.cost],
    { prevOutputs: zeroPips(), roundPool: G.roundPool },
    pitchDefs,
    cardId ? getOperatorCard(cardId) : null,
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `RAG ${chapter.name}`)

  if (chapterIx === RAG_UPSERT_INDEX && cardId) {
    removeFromHands(G, cardId)
    G.rag.upsertCardId = cardId
    G.rag.contribution = [...getOperatorCard(cardId).contributes]
    log(G, `RAG Upsert: payload set from ${getOperatorCard(cardId).name}`)
  }

  if (chapterIx === RAG_RERANK_INDEX && cardId) {
    removeFromHands(G, cardId)
    G.rag.contribution = [...getOperatorCard(cardId).contributes]
    G.rag.rerankUsed = true
    log(G, `RAG Rerank: payload swapped to ${getOperatorCard(cardId).name}'s contribution`)
  }

  G.rag.chaptersComplete += 1
  log(G, `RAG ${chapter.name} complete (${G.rag.chaptersComplete}/${RAG_CHAPTERS.length})`)

  // Completing the required chapters is the anti-entropy payoff.
  if (G.rag.chaptersComplete === RAG_RERANK_INDEX) {
    let removed = 0
    for (let i = 0; i < RAG_CLEAR_COUNT && G.entropyStack.length > 0; i++) {
      const ix = random ? random.Die(G.entropyStack.length) - 1 : 0
      const [pulled] = G.entropyStack.splice(ix, 1)
      if (pulled) {
        G.entropyDiscard.push(pulled)
        removed++
      }
    }
    log(G, `RAG online — cleared ${removed} Entropy at random`)
  }

  refillHand(G, `RAG ${chapter.name}`)
}

/**
 * Load a card into the Claw (design §4): feed cards face-down until it is
 * complete, then it acts as a second, parallel hand.
 * BEST-GUESS(Q7): completion at CLAW_COMPLETE_COUNT cards; loading feeds 1.
 */
export function loadClaw({ G, playerID }: MoveCtx, cardId: string) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!G.operatorHand.includes(cardId)) return INVALID_MOVE
  if (G.clawHand.length > 0) return INVALID_MOVE // already complete and unspent

  removeFromHands(G, cardId)
  G.clawPile.push(cardId)
  log(G, `loaded the Claw (${G.clawPile.length}/${CLAW_COMPLETE_COUNT})`)
  feedEntropy(G, 1, 'Claw load')

  if (G.clawPile.length >= CLAW_COMPLETE_COUNT) {
    G.clawHand = [...G.clawPile]
    G.clawPile = []
    log(G, 'Claw complete — available as a second hand')
  }
  refillHand(G, 'Claw load')
}

/** Upgrade the installed Model (design §4: "can be upgraded over the game"). */
export function upgradeModel(
  { G, playerID }: MoveCtx,
  cardId: string,
  pitchIds: string[] = [],
) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  if (!inHand(G, cardId)) return INVALID_MOVE

  const def = getOperatorCard(cardId)
  if (!MODEL_CARDS.some((m) => m.id === cardId)) return INVALID_MOVE

  const pitchDefs = resolvePitches(G, pitchIds)
  if (!pitchDefs) return INVALID_MOVE

  const result = planPayment(
    def.consume,
    { prevOutputs: zeroPips(), roundPool: G.roundPool },
    pitchDefs,
    def,
    ecosystemDiscount(G, def),
  )
  if (!result.ok) return INVALID_MOVE

  applyPlanToSources(result.plan, null, G.roundPool)
  executePitches(G, result.plan.pitches, `upgrading to ${def.name}`)
  removeFromHands(G, cardId)

  G.installedModelId = 'TEST-MODEL-FRONTIER'
  log(G, `upgraded model to ${def.name}`)
  feedEntropy(G, feedCostOf(def), `upgraded to ${def.name}`)
  refillHand(G, `upgraded to ${def.name}`)
}

/** Open an additional Process, if Parallelism has raised the limit. */
export function openProcess({ G, playerID }: MoveCtx) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  // Sub-contexts don't consume Process slots — only top-level chains do.
  const topLevel = G.contexts.filter((c) => c.parentChainIx === null).length
  if (topLevel >= G.processLimit) return INVALID_MOVE

  const evalCeiling = G.contexts[0]?.ceiling ?? DEFAULT_CONTEXT_CEILING
  G.contexts.push({
    slots: [],
    closed: false,
    ceiling: evalCeiling,
    parentChainIx: null,
    ownerCardId: null,
  })
  log(G, `opened Process ${topLevel + 1}`)
}

/** Close a Process. BEST-GUESS(Q15): closing is voluntary; a closed Process
 *  still scores ("closes out with or without your results" — design §4). */
export function closeProcess({ G, playerID }: MoveCtx, processIx: number) {
  if (G.phase !== 'play' || !canOperatorAct(G, playerID)) return INVALID_MOVE
  const chain = G.contexts[processIx]
  if (!chain || chain.closed) return INVALID_MOVE

  chain.closed = true
  log(G, `closed context ${processIx + 1}`)
}

// NOTE: playing a Tool or Skill INLINE (the cheap option that grants no
// Durable) needs no move of its own — it is just `playToContext`, whose
// Entropy price is the card's own feed (INLINE_PLACEMENT_ENTROPY by default).
// The expensive, persistent options are `installServer` and `attachSkill`.
