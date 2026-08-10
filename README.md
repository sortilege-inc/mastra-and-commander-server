# mastra-and-commander-server

The **play engine** for **Mastra & Commander** — an asymmetric alignment
duel (Operator vs. Entropy around an Eval). Built on
[boardgame.io](https://boardgame.io/) (v0.50) with React 18, TypeScript, and
Vite.

The framework layer here is ported from [tcggg](https://github.com/sortilege-inc/tcggg),
the sister multi-game play engine. This repo keeps tcggg's game-agnostic
shell (game/format selection, deck-import scaffolding, saved games, replay
transcripts) and swaps in Mastra & Commander as the game.

## Status

**First pass — playable end to end.** The full round loop (Reveal → Play →
Entropy → Response → Eval check → rollover) runs with every subsystem
implemented: the pitch economy, the Context I/O chain, the Entropy LIFO stack
and all three wrench vectors, Contribution/Eval scoring on the success ladder,
relay/Durable, RAG, the Claw, servers, Features, Models, equipment, Processes,
and ecosystem discounts. A 5-round match resolves to a winner.

⚠ **Many rules here are BEST-GUESS placeholders.** The design doc
([`../mastra-and-commander/cards/game-design.md`](../mastra-and-commander/cards/game-design.md))
leaves ~19 questions open (🟨/❓); the owner signed off (2026-08-10) on
implementing first-pass rules for all of them so the game could be played and
felt. Every invention is tagged `BEST-GUESS(Qn)` in the code and listed in the
[Best-guess registry](#best-guess-registry-for-design-review) below — that list
is the audit surface, and each entry is expected to be revised.

All cards are **synthetic `TEST-` placeholders** authored to exercise the
engine. They are not card design; the real roster and its mechanics remain the
owner's design pass. A TicTacToe placeholder is kept alongside as a known-good
wiring baseline.

The **card content and printed frames** live in the sibling repo
[`../mastra-and-commander/`](../mastra-and-commander) (the Lens frame system +
Squib render pipeline + `cards/`). This repo is the play side only.

## Quick start

```sh
npm install
npm run dev        # http://localhost:3000
```

`npm run build` type-checks and produces a production bundle under `dist/`.
`npm run typecheck` runs `tsc --noEmit`. `npm test` runs Vitest.

## File layout

```
src/
  main.tsx              Vite entry — mounts <App /> into #root.
  App.tsx               Shell: game-select → (deck-import) → game.
  framework/            Game-agnostic engine shell (ported from tcggg).
    GameSelect.tsx      Pick game + format + mode (localStorage memory).
    registry.ts         Game registry — the ONE place allowed to import games/.
    types.ts            GameRegistration + DeckExport shapes.
    DeckImport.tsx      File/paste import for an exported deck JSON.
    storage.ts          localStorage helpers.
    savedGame.ts        Save / restore an in-progress game.
    replayTranscript.ts Records moves + outcome to a JSONL transcript.
    ...                 (aiDriver, card image + catalog helpers, etc.)
  games/
    mastra-and-commander/
      index.ts          Exports the GameRegistration.
      Game.ts           MANIFEST: setup + moves map of imported handlers.
      types.ts          MCState — flat, JSON-serializable game state.
      constants.ts      Single source of truth for every rules tunable.
      gates.ts          GATE_MANIFEST — the pending* gate registry.
      playerView.ts     Per-seat redaction of hidden information.
      theme.ts          Shared style vocabulary for the board.
      cards/            Card data contract, the TEST- set, and the registry.
      rules/            Move handlers (*Moves.ts) + pure helpers (*Helpers.ts).
        ioFlow.ts       ★ The provisional-I/O quarantine (see below).
      testing/          Fixtures built from the real setup().
      Board.tsx         Composition root + solo auto-driver.
      ContextRow / HandPanel / SidePanels / GateOverlays
    tic-tac-toe/        boardgame.io hello-world; wiring baseline.
index.html              Vite HTML shell.
vite.config.ts          Vite + @vitejs/plugin-react config.
```

## Engine design notes

**Flat `G.phase`, not boardgame.io `phases`.** The round loop is a plain state
field advanced by the `advancePhase` move, with per-move guards. bg.io's
`phases` scope the move map and interact with turn order, but this game needs
*both* seats live inside one phase — during Entropy the Entropy player picks
targets while the Operator draws a card per Entropy resolved. Flat phase +
guards is simpler and is what the gate pattern wants anyway.

**`Game.ts` is a manifest.** Move bodies live in `rules/<area>Moves.ts`, pure
logic in `rules/<area>Helpers.ts`. (tcggg's L5R engine learned this the hard
way — inlining move bodies produced an unmaintainable file.)

**The gate pattern.** Every `pending*` field on the state blocks play until a
specific move clears it. `gates.ts` derives `PendingGateKey` from the state
type, so adding a gate *fails to compile* until it is registered, and
`gates.test.ts` verifies the manifest's claimed moves and overlays really
exist. This prevents the failure mode where a new gate silently deadlocks a
game or hides from the UI.

**★ The provisional-I/O quarantine.** The owner flagged the consume/produce
flow as provisional ("expect this to change through playtesting").
`rules/ioFlow.ts` is therefore the *only* module that knows what
consume/produce/pitching mean — everything else calls `planPayment`. Reworking
the I/O flow should touch that file and its test, and nothing else.

**Solo vs hotseat.** The engine is mode-agnostic (the framework's `GameMode`
never reaches `setup()`). In solo, `Board.tsx` auto-dispatches the Entropy
seat's moves, auto-targeting the leftmost eligible target; in hotseat the
Entropy player chooses via the overlay. Both drive the *same* moves.

## Architecture: framework vs. game (required)

Framework code (`src/framework/`) is **game-agnostic** and must not import
from any specific game. Game code lives under `src/games/<game-id>/` and
registers itself via a `GameRegistration`. `src/framework/registry.ts` is the
single seam where the framework learns which games exist. See
[`CLAUDE.md`](CLAUDE.md) for the full rules.

## Best-guess registry (for design review)

Every rule below was **invented to make the game playable**, because the design
doc leaves the question open. Each maps to a numbered question in
[`game-design.md`](../mastra-and-commander/cards/game-design.md) §9 where one
exists, and is tagged `BEST-GUESS(Qn)` at its implementation site. **Expect to
revise these** — the numbers are chosen for testability, not balance. Nearly all
of them live in `constants.ts`.

| # | Rule as implemented | Resolves |
|---|---|---|
| 1 | Ladder bands: pattern met & ≤`superiorAt` → superior; ≤par → best; over par → lesser; unmet → failure | 🟨 par scoring |
| 2 | A `superior` pass logs that a Reward card *would* be earned — no reward deck exists yet (honest stub, not an invented card) | §4 |
| 3 | A `lesser` pass feeds **1** extra Entropy next round | §4 |
| 4 | On failure, the round's resolved Entropy returns to the stack (literal "persists") | §4 |
| 5 | Relaying a non-Durable card costs **Entropy only**, no resources | ❓Q4 |
| 6 | RAG steps cost a card but no resources; each feeds; completing clears **3** at random; locks to the final card's first contribution | ❓Q5 |
| 7 | Ecosystem discount: −1 **generic** pip when a same-ecosystem card is in play. Ecosystems: anthropic / openai / google / oss | ❓Q6 |
| 8 | Claw completes at **3** cards; each load feeds 1; the complete pile becomes a second hand | ❓Q7 |
| 9 | Solo: Entropy auto-feeds from the deck top and auto-targets the **leftmost eligible** target | ❓Q8 |
| 10 | Server substrate comes from the Operator's **hand**; the face-down discard feeds 1 | ❓Q9 |
| 11 | Installs are a flat list, no server zone / ice. A live server grants **1 generic** per round; `attackServer` destroys it | ❓Q10 |
| 12 | Models are free-resource engines granting pips at Reveal; upgrading = playing a Model-trait card | ❓Q11 |
| 13 | Local Rig grants ⚙, Cloud grants ◆. Auto-pitch mills **1 card per equipment**, with no draw and **no Entropy feed** (it is the free baseline economy) | ❓Q12 |
| 14 | Match = **5 rounds**; Operator wins on **≥3 passes** (`lesser` counts as a pass) | ❓Q13 |
| 15 | Goal-hijack is a minimal open swap with the next Eval card; the hidden true-objective layer is **deferred** | ❓Q14 |
| 16 | Closing a Process is voluntary; a closed Process still scores | ❓Q15 |
| 17 | Features are chosen fresh each eval; **3** offered, 1–3 picked by difficulty | 🟨 Q18 |
| 18 | Payment matrix: a typed output pays its own type *or* a generic pip; a generic output pays only generic pips | ❓Q2 / 🟨19 |
| 19 | Commander (placeholder): pitch a card whose cost includes ◉ → gain ⚙⚙⚙, unrestricted. **The printed Mastra card is deliberately NOT implemented** (pending redesign) | — |
| 20 | Deck exhaustion: draws and feeds no-op with a log line; **no reshuffles** | — |
| 21 | Contribution vocabulary: **5 colors × 5 ordered shapes** (owner-decided) | ❓Q1 |

Also note: the design's **stat badge** is not modeled at all — the new frame has
no stat zone and the Eval scores contributions instead (❓Q3).

## Carried over from tcggg (known stubs)

The ported framework still carries tcggg conventions that Mastra & Commander
hasn't specced yet — all game-agnostic and inert until this game needs them:

- **Deck import** (`DeckImport`, `validateDeckExport`, `CardCatalogContext`)
  expects a tcgdb-style `exportVersion: 1` deck JSON. The scaffold game
  declares no `applyDeckExport`, so the framework skips the import flow
  entirely and starts the game immediately.
- Internal `localStorage` keys and the deck-restore path still use tcggg /
  L5R-shaped names (`tcggg.*`, `stronghold/dynasty/conflict` zones). These
  will be renamed when Mastra & Commander defines its own decks.

## Adding multiplayer later

Runs **local (hot-seat) only** today. Networked play follows tcggg's plan:
add a `boardgame.io/server`, then swap the local client to a
`SocketIO` multiplayer client.
