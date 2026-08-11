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
and ecosystem discounts. A **3-eval** match resolves to a winner.

Key mechanics as of the 2026-08-10 rulings:

- **Mastra** makes the **first Agent each round free** — no cost, no Entropy.
- **Pitching is always legal**; its Entropy price is set by how the pitched
  card's Contribution matches the card being paid for: **1** for colour+shape,
  **2** for either, **3** for neither.
- The hand is **always five cards**; the **deck** is the clock, and cycling it
  ends the match.
- **Tools** install as MCP servers (Tool + face-down substrate, 2 Entropy,
  Durable, persists) or play inline for 1 without Durable. **Skills** attach to
  the rig/cloud for Durable, or play inline without.
- Installed Tools/Skills and a completed RAG **don't score on their own** — you
  play a card **face-down as a call**, free, and the called resource's
  Contribution enters the Context. Face-down cards are **skipped for I/O**.
- **RAG is a setup saga**: Chunk/Embed/Insert/Upsert/(Rerank), 1 pip each of a
  different type; Upsert's fed card sets the payload, Rerank swaps it for one of
  equal size.
- A context window holds **7 cards** (or whatever the Objective says);
  **Subagents open their own** window that doesn't count against the parent's.

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

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.
**Set Settings → Pages → Source to "GitHub Actions"**, not "Deploy from a
branch".

That setting is the whole trick. Serving a branch publishes the repo *root*, so
visitors get the dev `index.html`, which asks for `/src/main.tsx` — and Pages
serves raw `.tsx` as `application/octet-stream`, which the browser rejects:

```
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "application/octet-stream".
```

The published artifact must be the built `dist/`, never the source tree.

**Custom domain.** `CNAME` pins the site to `mastra.sortilege.online`, which
serves from the domain *root*, so the build keeps the default base of `/` and
the workflow copies `CNAME` into `dist/`. Only the artifact is published — a
`CNAME` left in the repo root alone is never served.

**Without a custom domain**, a project site lives at
`https://<org>.github.io/<repo>/` and the asset URLs need that prefix, or every
`/assets/...` request 404s. Drop the `CNAME` and build with:

```bash
BASE_PATH=/mastra-and-commander-server/ npm run build
```

Card art resolves through `import.meta.env.BASE_URL`, so it follows `BASE_PATH`
automatically — hard-coded absolute `/cards/...` or `/assets/...` paths would
break under a subpath.

## Card art

The board renders the **real printed faces** — the Squib/Ice-Chrome renders from
the design repo — not bespoke UI cards. `public/cards/<cardId>.webp` holds one
face per card plus the two deck backs (`back-operator`, `back-entropy`).

These are **derived assets**, mirrored from
`../mastra-and-commander/output/*.png` and downscaled (16.3 MB of PNG → 1.1 MB
of WebP). They are committed so a clone is playable, but the design repo remains
the source of truth — never hand-edit them. To refresh after a re-render:

```bash
python3 scripts/import-card-art.py
```

That script renames faces from their `cards.yml` position to the engine card id.
The mapping is positional, so it **refuses to run** if the image count and its id
list disagree rather than silently misaligning every card — if you add a card,
update `ORDERED_IDS` to match `cards.yml`.

Because the face already prints name, traits, cost, produce and contributions,
the UI doesn't repeat them; it shows only what the card can't (outputs
remaining, subverted/relay state, pitch marking). **Hover any card** for a
readable 400px preview. A card with no art degrades to a text plate, so you can
add cards before their art exists.

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
| 6 | RAG completion clears **3** Entropy at random | ❓Q5 (rest now locked) |
| 7 | Ecosystem discount: −1 **generic** pip when a same-ecosystem card is in play. Ecosystems: anthropic / openai / google / oss | ❓Q6 |
| 8 | Claw completes at **3** cards; each load feeds 1; the complete pile becomes a second hand | ❓Q7 |
| 9 | Solo: Entropy auto-feeds from the deck top and auto-targets the **leftmost eligible** target | ❓Q8 |
| 10 | Installs are a flat list, no server zone / ice. A live server grants **1 generic** per round; `attackServer` destroys it | ❓Q10 |
| 11 | Models are free-resource engines granting pips at Reveal; upgrading = playing a Model-trait card | ❓Q11 |
| 12 | Local Rig grants ⚙, Cloud grants ◆. Auto-pitch mills **1 card per equipment**, with no draw and **no Entropy feed** (it is the free baseline economy) | ❓Q12 |
| 13 | Operator wins the 3-eval match on **≥2 passes** (`lesser` counts as a pass) | ❓Q13 (length now locked) |
| 14 | Goal-hijack is a minimal open swap with the next Eval card; the hidden true-objective layer is **deferred** | ❓Q14 |
| 15 | Closing a Process is voluntary; a closed Process still scores | ❓Q15 |
| 16 | Features are chosen fresh each eval; **3** offered, 1–3 picked by difficulty | 🟨 Q18 |
| 17 | Payment matrix: a typed output pays its own type *or* a generic pip; a generic output pays only generic pips | ❓Q2 / 🟨19 |
| 18 | Deck exhaustion during a round: draws/feeds no-op with a log line, **no reshuffles**; an empty deck at round end ends the match | — |
| 19 | RAG chapter costs (⚙ / ◉ / ◆ / ○ / ⚙) — "a different 1-cost each" was the ruling; the specific assignment is ours | — |
| 20 | One Skill per loadout item | — |
| 21 | A face-down CALL costs no resources either (the ruling specified zero *Entropy*) | — |

**Locked by the 2026-08-10 rulings** (no longer guesses): contribution vocabulary
(5×5), same-currency outputs, stat badge dropped, the 1/2/3 pitch scale, Mastra's
free-Agent ability, the always-five hand, the 3-eval match and deck-out end
condition, Tool/Skill install-vs-inline, face-down calls, face-down cards skipped
for I/O, RAG as a setup saga, and the 7-card context ceiling with subagent
sub-contexts.

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
